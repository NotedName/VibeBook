import { logActivity } from "./activity";
import { pushNote } from "./notifications";
import { useEffect, useMemo, useState } from "react";
import {
  arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { nameKeys } from "./profiles";
import { clip } from "./text";
import type { Group, GroupInvite, GroupRole, Member } from "./types";

export const GROUP_NAME_MAX = 60;
export const GROUP_DESC_MAX = 300;

type Stored = Partial<Omit<Group, "id">>;

function toGroup(id: string, d: Stored): Group {
  return { id, name: d.name ?? "", description: d.description ?? "", ownerUid: d.ownerUid ?? "", avatar: d.avatar ?? "", coverPhoto: d.coverPhoto ?? "" };
}

/** Membership is one document per person and group, named "<groupId>_<uid>". */
const memberRef = (gid: string, uid: string) => doc(db, "groupMembers", `${gid}_${uid}`);

/** Lists an entry in a group's feed. Named "<ownerUid>_<entryId>". */
export const groupPostRef = (gid: string, ownerUid: string, entryId: string) =>
  doc(db, "groups", gid, "posts", `${ownerUid}_${entryId}`);

/** Lists someone's repost of another person's entry in a group's feed. */
export const repostPostRef = (gid: string, me: string, ownerUid: string, entryId: string) =>
  doc(db, "groups", gid, "posts", `${me}_rp_${ownerUid}_${entryId}`);

const cache = new Map<string, Promise<Group | null>>();

/** Bumped when a group is edited, so every place showing its name fetches it again. */
const editListeners = new Set<() => void>();
function useGroupRevision(): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    const bump = () => setRev((n) => n + 1);
    editListeners.add(bump);
    return () => { editListeners.delete(bump); };
  }, []);
  return rev;
}

export function fetchGroup(id: string): Promise<Group | null> {
  let p = cache.get(id);
  if (!p) {
    p = getDoc(doc(db, "groups", id)).then((s) => (s.exists() ? toGroup(id, s.data() as Stored) : null));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** Group for any id. undefined while loading, null when it does not exist. */
export function useGroup(id: string): Group | null | undefined {
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const rev = useGroupRevision();
  useEffect(() => {
    let live = true;
    fetchGroup(id).then((g) => live && setGroup(g), () => live && setGroup(null));
    return () => { live = false; };
  }, [id, rev]);
  useEffect(() => setGroup(undefined), [id]);
  return group;
}

export async function createGroup(uid: string, name: string, description: string): Promise<string> {
  const clean = { name: clip(name.trim(), GROUP_NAME_MAX), description: clip(description.trim(), GROUP_DESC_MAX) };
  const ref = doc(collection(db, "groups"));
  const batch = writeBatch(db);
  batch.set(ref, { ...clean, avatar: "", coverPhoto: "", nameKeys: nameKeys(clean.name), ownerUid: uid, createdAt: serverTimestamp() });
  batch.set(memberRef(ref.id, uid), { groupId: ref.id, uid, role: "admin", joinedAt: serverTimestamp() });
  await batch.commit();
  logActivity(uid, `Created the group “${clean.name}”`, { href: `#/g/${ref.id}` });
  return ref.id;
}

export const joinGroup = (uid: string, gid: string) =>
  setDoc(memberRef(gid, uid), { groupId: gid, uid, role: "member", joinedAt: serverTimestamp() })
    .then(() => logActivity(uid, "Joined a group", { href: `#/g/${gid}` }));

/** Leaving also takes your entries out of the group, so its members stop seeing them. */
export async function leaveGroup(uid: string, gid: string): Promise<void> {
  const mine = await getDocs(query(collection(db, "users", uid, "entries"), where("groupIds", "array-contains", gid)));
  for (let i = 0; i < mine.docs.length; i += 200) {
    const batch = writeBatch(db);
    mine.docs.slice(i, i + 200).forEach((d) => {
      batch.update(d.ref, { groupIds: arrayRemove(gid) });
      batch.delete(groupPostRef(gid, uid, d.id));
    });
    await batch.commit();
  }
  // Reposts shared to the group come out too.
  const reposts = await getDocs(query(collection(db, "users", uid, "reposts"), where("groupIds", "array-contains", gid)));
  for (let i = 0; i < reposts.docs.length; i += 200) {
    const batch = writeBatch(db);
    reposts.docs.slice(i, i + 200).forEach((d) => {
      const r = d.data() as { ownerUid: string; entryId: string };
      batch.update(d.ref, { groupIds: arrayRemove(gid) });
      batch.delete(repostPostRef(gid, uid, r.ownerUid, r.entryId));
    });
    await batch.commit();
  }
  await deleteDoc(memberRef(gid, uid));
  logActivity(uid, "Left a group", { href: `#/g/${gid}` });
}

const inviteRef = (gid: string, to: string) => doc(db, "groupInvites", `${gid}_${to}`);

/** Invites every person in one batch. Only members of the group can invite. */
export async function inviteToGroup(from: string, gid: string, toUids: string[], groupName = ""): Promise<void> {
  const batch = writeBatch(db);
  toUids.forEach((to) => batch.set(inviteRef(gid, to), { groupId: gid, from, to, createdAt: serverTimestamp() }));
  await batch.commit();
  await Promise.all(toUids.map((to) => pushNote(to, from, `group_invite_${gid}`, "group_invite", { groupId: gid, groupName })));
}

/** Accepting joins the group and clears the invite in one step. */
export async function acceptInvite(uid: string, gid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(memberRef(gid, uid), { groupId: gid, uid, role: "member", joinedAt: serverTimestamp() });
  batch.delete(inviteRef(gid, uid));
  await batch.commit();
}

export const declineInvite = (uid: string, gid: string) => deleteDoc(inviteRef(gid, uid));

/** Who you have already invited to this group, so they are not offered again. */
export async function loadMyInvitees(uid: string, gid: string): Promise<string[]> {
  const snap = await getDocs(query(collection(db, "groupInvites"), where("from", "==", uid), where("groupId", "==", gid)));
  return snap.docs.map((d) => d.data().to as string);
}

/** Live invitations sent to the signed-in person. */
export function useGroupInvites(uid: string): GroupInvite[] {
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  useEffect(
    () => onSnapshot(
      query(collection(db, "groupInvites"), where("to", "==", uid)),
      (snap) => setInvites(snap.docs.map((d) => ({
        id: d.id, groupId: d.data().groupId as string, from: d.data().from as string, to: uid,
      }))),
      () => setInvites([]),
    ),
    [uid],
  );
  return invites;
}

export async function loadMembers(gid: string): Promise<string[]> {
  const snap = await getDocs(query(collection(db, "groupMembers"), where("groupId", "==", gid), limit(MEMBERS_MAX)));
  return snap.docs.map((d) => d.data().uid as string);
}

const MEMBERS_MAX = 200;
const RANK: Record<GroupRole, number> = { admin: 0, moderator: 1, member: 2 };
const asRole = (r: unknown): GroupRole => (r === "admin" || r === "moderator" ? r : "member");

/** Live members of a group with their roles. null while loading. */
export function useGroupMembers(gid: string): { members: Member[] | null; error: string } {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setMembers(null); setError("");
    return onSnapshot(
      query(collection(db, "groupMembers"), where("groupId", "==", gid), limit(MEMBERS_MAX)),
      (snap) => setMembers(snap.docs.map((d) => {
        const x = d.data();
        return { uid: x.uid as string, role: asRole(x.role), joinedAt: x.joinedAt?.toMillis?.() ?? Date.now() };
      })),
      () => setError("Could not load members."),
    );
  }, [gid]);
  return { members, error };
}

/** The group's creator is always an admin. Admins first, then moderators, then members, oldest first. */
export function withRoles(members: Member[], ownerUid: string): Member[] {
  return members
    .map((m) => (m.uid === ownerUid ? { ...m, role: "admin" as const } : m))
    .sort((a, b) => (a.uid === ownerUid ? -1 : b.uid === ownerUid ? 1 : RANK[a.role] - RANK[b.role] || a.joinedAt - b.joinedAt));
}

/** Admins can change anyone's role except the owner's and their own. */
export const canChangeRole = (mine: GroupRole | null, target: Member, ownerUid: string, myUid: string) =>
  mine === "admin" && target.uid !== ownerUid && target.uid !== myUid;

/** Admins can remove anyone but the owner; moderators can remove plain members. Nobody removes themselves here (they leave). */
export const canRemove = (mine: GroupRole | null, target: Member, ownerUid: string, myUid: string) =>
  target.uid !== ownerUid && target.uid !== myUid
  && (mine === "admin" || (mine === "moderator" && target.role === "member"));

export const setMemberRole = (gid: string, uid: string, role: GroupRole) => updateDoc(memberRef(gid, uid), { role });

const banRef = (gid: string, uid: string) => doc(db, "groups", gid, "bans", uid);

/**
 * Removes someone from a group and takes their posts out of its feed. They are also barred from
 * joining again (groups are otherwise open) until an admin lets them back in.
 */
export async function removeMember(gid: string, uid: string, by: string): Promise<void> {
  const posts = collection(db, "groups", gid, "posts");
  const [own, reposts] = await Promise.all([
    getDocs(query(posts, where("ownerUid", "==", uid))),
    getDocs(query(posts, where("repostedBy", "==", uid))),
  ]);
  // an entry of theirs that someone else reposted into the group is that person's post, so it stays
  const refs = [...own.docs.filter((d) => !d.data().repostedBy), ...reposts.docs].map((d) => d.ref);
  for (let i = 0; i < refs.length; i += 200) {
    const batch = writeBatch(db);
    refs.slice(i, i + 200).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  const batch = writeBatch(db);
  batch.set(banRef(gid, uid), { by, createdAt: serverTimestamp() });
  batch.delete(memberRef(gid, uid));
  await batch.commit();
}

/** Takes one post out of the group's feed. The entry itself stays with its author. */
export const removePostFromGroup = (gid: string, ownerUid: string, entryId: string, repostedBy?: string) =>
  deleteDoc(repostedBy ? repostPostRef(gid, repostedBy, ownerUid, entryId) : groupPostRef(gid, ownerUid, entryId));

/** People removed from a group who cannot rejoin. Only admins and moderators may read this. */
export function useBannedUids(gid: string, enabled: boolean): string[] {
  const [uids, setUids] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) { setUids([]); return; }
    return onSnapshot(collection(db, "groups", gid, "bans"), (snap) => setUids(snap.docs.map((d) => d.id)), () => setUids([]));
  }, [gid, enabled]);
  return uids;
}

export const allowBack = (gid: string, uid: string) => deleteDoc(banRef(gid, uid));

export async function updateGroup(gid: string, name: string, description: string): Promise<void> {
  const clean = { name: clip(name.trim(), GROUP_NAME_MAX), description: clip(description.trim(), GROUP_DESC_MAX) };
  await updateDoc(doc(db, "groups", gid), { ...clean, nameKeys: nameKeys(clean.name) });
  cache.delete(gid);
  editListeners.forEach((f) => f());
}

/** Admins: saves the group's name, description and any changed pictures in one write, so a save either happens whole or not at all. */
export async function saveGroupChanges(
  gid: string, name: string, description: string, photos: Partial<Pick<Group, "avatar" | "coverPhoto">>,
): Promise<void> {
  const clean = { name: clip(name.trim(), GROUP_NAME_MAX), description: clip(description.trim(), GROUP_DESC_MAX) };
  await updateDoc(doc(db, "groups", gid), { ...clean, nameKeys: nameKeys(clean.name), ...photos });
  cache.delete(gid);
  editListeners.forEach((f) => f());
}

/** Admins: sets, replaces or (with "") removes the group's picture and cover photo. */
export async function updateGroupPhotos(gid: string, change: Partial<Pick<Group, "avatar" | "coverPhoto">>): Promise<void> {
  await updateDoc(doc(db, "groups", gid), change);
  cache.delete(gid);
  editListeners.forEach((f) => f());
}

function prime(groups: Group[]): Group[] {
  groups.forEach((g) => cache.set(g.id, Promise.resolve(g)));
  return groups;
}

/** Newest groups, for browsing. */
export async function discoverGroups(): Promise<Group[]> {
  const snap = await getDocs(query(collection(db, "groups"), orderBy("createdAt", "desc"), limit(20)));
  return prime(snap.docs.map((d) => toGroup(d.id, d.data() as Stored)));
}

/** Finds groups whose name starts with every word typed. */
export async function searchGroups(text: string): Promise<Group[]> {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const main = Array.from(tokens.reduce((a, b) => (b.length > a.length ? b : a))).slice(0, 20).join("");
  const snap = await getDocs(query(collection(db, "groups"), where("nameKeys", "array-contains", main), limit(30)));
  const found = snap.docs
    .map((d) => toGroup(d.id, d.data() as Stored))
    .filter((g) => {
      const words = g.name.toLowerCase().split(/\s+/);
      return tokens.every((t) => words.some((w) => w.startsWith(t)));
    });
  return prime(found).sort((a, b) => a.name.localeCompare(b.name));
}

export type MyGroups = { list: Group[]; ids: Set<string>; ready: boolean; error: string };

/** Live list of the groups the signed-in person has joined. Subscribed once per session. */
export function useMyGroups(uid: string): MyGroups {
  const [ids, setIds] = useState<string[] | null>(null);
  const [list, setList] = useState<Group[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const rev = useGroupRevision();

  useEffect(
    () => onSnapshot(
      query(collection(db, "groupMembers"), where("uid", "==", uid)),
      (snap) => setIds(snap.docs.map((d) => d.data().groupId as string).sort()),
      () => { setError("Could not load your groups. Check your connection."); setReady(true); },
    ),
    [uid],
  );

  const key = ids?.join(",");
  useEffect(() => {
    if (!ids) return;
    let live = true;
    Promise.all(ids.map(fetchGroup)).then(
      (groups) => { if (live) { setList(groups.filter((g): g is Group => g !== null)); setReady(true); } },
      () => { if (live) { setError("Could not load your groups. Check your connection."); setReady(true); } },
    );
    return () => { live = false; };
    // ids is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rev]);

  return useMemo(() => ({ list, ids: new Set(ids ?? []), ready, error }), [list, ids, ready, error]);
}
