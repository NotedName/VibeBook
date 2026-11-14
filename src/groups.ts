import { useEffect, useMemo, useState } from "react";
import {
  arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { nameKeys } from "./profiles";
import type { Group, GroupInvite } from "./types";

export const GROUP_NAME_MAX = 60;
export const GROUP_DESC_MAX = 300;

type Stored = Partial<Omit<Group, "id">>;

function toGroup(id: string, d: Stored): Group {
  return { id, name: d.name ?? "", description: d.description ?? "", ownerUid: d.ownerUid ?? "" };
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
  useEffect(() => {
    let live = true;
    setGroup(undefined);
    fetchGroup(id).then((g) => live && setGroup(g), () => live && setGroup(null));
    return () => { live = false; };
  }, [id]);
  return group;
}

export async function createGroup(uid: string, name: string, description: string): Promise<string> {
  const clean = { name: name.trim().slice(0, GROUP_NAME_MAX), description: description.trim().slice(0, GROUP_DESC_MAX) };
  const ref = doc(collection(db, "groups"));
  const batch = writeBatch(db);
  batch.set(ref, { ...clean, nameKeys: nameKeys(clean.name), ownerUid: uid, createdAt: serverTimestamp() });
  batch.set(memberRef(ref.id, uid), { groupId: ref.id, uid, joinedAt: serverTimestamp() });
  await batch.commit();
  return ref.id;
}

export const joinGroup = (uid: string, gid: string) =>
  setDoc(memberRef(gid, uid), { groupId: gid, uid, joinedAt: serverTimestamp() });

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
}

const inviteRef = (gid: string, to: string) => doc(db, "groupInvites", `${gid}_${to}`);

/** Invites every person in one batch. Only members of the group can invite. */
export async function inviteToGroup(from: string, gid: string, toUids: string[]): Promise<void> {
  const batch = writeBatch(db);
  toUids.forEach((to) => batch.set(inviteRef(gid, to), { groupId: gid, from, to, createdAt: serverTimestamp() }));
  await batch.commit();
}

/** Accepting joins the group and clears the invite in one step. */
export async function acceptInvite(uid: string, gid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(memberRef(gid, uid), { groupId: gid, uid, joinedAt: serverTimestamp() });
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
  const snap = await getDocs(query(collection(db, "groupMembers"), where("groupId", "==", gid), limit(100)));
  return snap.docs.map((d) => d.data().uid as string);
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
  const main = tokens.reduce((a, b) => (b.length > a.length ? b : a)).slice(0, 20);
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
  }, [key]);

  return useMemo(() => ({ list, ids: new Set(ids ?? []), ready, error }), [list, ids, ready, error]);
}
