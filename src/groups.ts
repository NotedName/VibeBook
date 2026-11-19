import { logActivity } from "./activity";
import { pushNote } from "./notifications";
import { useEffect, useMemo, useState } from "react";
import {
  arrayRemove, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch, type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { syncEntryPrivacy } from "./entryPrivacy";
import { nameKeys } from "./profiles";
import { clip } from "./text";
import {
  ANSWER_MAX, GROUP_QUESTIONS_MAX, QUESTION_MAX, REQUEST_MESSAGE_MAX,
  type Group, type GroupInvite, type GroupPrivacy, type GroupRole, type JoinRequest, type Member,
} from "./types";

export const GROUP_NAME_MAX = 60;
export const GROUP_DESC_MAX = 300;

type Stored = Partial<Omit<Group, "id">>;

function toGroup(id: string, d: Stored): Group {
  return {
    id, name: d.name ?? "", description: d.description ?? "", ownerUid: d.ownerUid ?? "", avatar: d.avatar ?? "", coverPhoto: d.coverPhoto ?? "", cover: d.cover === "dusk" || d.cover === "steel" ? d.cover : "amethyst",
    privacy: d.privacy === "private" ? "private" : "public",
    questions: Array.isArray(d.questions) ? d.questions.filter((q): q is string => typeof q === "string") : [],
  };
}

export const isPrivate = (g: Pick<Group, "privacy"> | null | undefined) => g?.privacy === "private";

/** Trims, drops empty ones and applies the limits. Public groups never keep questions. */
export function cleanQuestions(questions: string[], privacy: GroupPrivacy): string[] {
  if (privacy !== "private") return [];
  return questions.map((q) => clip(q.trim(), QUESTION_MAX)).filter(Boolean).slice(0, GROUP_QUESTIONS_MAX);
}

/** Membership is one document per person and group, named "<groupId>_<uid>". */
const memberRef = (gid: string, uid: string) => doc(db, "groupMembers", `${gid}_${uid}`);

/** Lists an entry in a group's feed. Named "<ownerUid>_<entryId>". */
export const groupPostRef = (gid: string, ownerUid: string, entryId: string) =>
  doc(db, "groups", gid, "posts", `${ownerUid}_${entryId}`);

/** Lists someone's repost of another person's entry in a group's feed. */
export const repostPostRef = (gid: string, me: string, ownerUid: string, entryId: string) =>
  doc(db, "groups", gid, "posts", `${me}_rp_${ownerUid}_${entryId}`);

/**
 * Which of these groups already have this entry in their feed, as the original post or as someone else's repost.
 * An entry can only be in a group once, so those groups cannot be reposted to. Your own repost is not counted
 * (you can still change it). You must be a member of the groups you ask about.
 */
export async function groupsHoldingEntry(gids: string[], ownerUid: string, entryId: string, me: string): Promise<Set<string>> {
  const mine = (gid: string) => repostPostRef(gid, me, ownerUid, entryId).id;
  const hits = await Promise.all(gids.map(async (gid) => {
    const snap = await getDocs(query(
      collection(db, "groups", gid, "posts"), where("ownerUid", "==", ownerUid), where("entryId", "==", entryId),
    ));
    return snap.docs.some((d) => d.id !== mine(gid)) ? gid : null;
  }));
  return new Set(hits.filter((g): g is string => g !== null));
}

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

export async function createGroup(
  uid: string, name: string, description: string, privacy: GroupPrivacy = "public", questions: string[] = [],
): Promise<string> {
  const clean = { name: clip(name.trim(), GROUP_NAME_MAX), description: clip(description.trim(), GROUP_DESC_MAX) };
  const ref = doc(collection(db, "groups"));
  const batch = writeBatch(db);
  batch.set(ref, {
    ...clean, privacy, questions: cleanQuestions(questions, privacy), avatar: "", coverPhoto: "",
    nameKeys: nameKeys(clean.name), ownerUid: uid, createdAt: serverTimestamp(),
  });
  batch.set(memberRef(ref.id, uid), { groupId: ref.id, uid, role: "admin", joinedAt: serverTimestamp() });
  await batch.commit();
  logActivity(uid, `Created the group “${clean.name}”`, { href: `#/g/${ref.id}` });
  return ref.id;
}

/** Joins a public group. (Private groups need an approved request or an invitation; firestore.rules enforces it.) */
export async function joinGroup(uid: string, gid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(memberRef(gid, uid), { groupId: gid, uid, role: "member", joinedAt: serverTimestamp() });
  batch.delete(requestRef(gid, uid)); // a request left over from when the group was private
  await batch.commit();
  logActivity(uid, "Joined a group", { href: `#/g/${gid}` });
}

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
  // Entries that were only locked because of this private group go back to the visibility their author chose.
  await syncEntryPrivacy(uid).catch(() => {});
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
  batch.delete(requestRef(gid, uid)); // being invited settles any request you had sent
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

const requestRef = (gid: string, uid: string) => doc(db, "groups", gid, "requests", uid);

/**
 * Asks to join a private group. The message says why; answers go with the group's questions, in order. Admins and
 * moderators are told in their notifications and approve or decline from Manage group.
 */
export async function requestToJoin(uid: string, group: Group, message: string, answers: string[]): Promise<void> {
  const text = clip(message.trim(), REQUEST_MESSAGE_MAX);
  if (!text) throw new Error("Say why you would like to join.");
  const given = group.questions.map((_, i) => clip((answers[i] ?? "").trim(), ANSWER_MAX));
  if (given.some((a) => !a)) throw new Error("Answer each question.");
  await setDoc(requestRef(group.id, uid), { message: text, answers: given, createdAt: serverTimestamp() });
  logActivity(uid, `Asked to join the group “${group.name}”`, { href: `#/g/${group.id}` });
  // Tell the people who can approve. Best effort: the request is already saved.
  try {
    const staff = await getDocs(query(collection(db, "groupMembers"), where("groupId", "==", group.id), where("role", "in", ["admin", "moderator"])));
    const to = new Set([group.ownerUid, ...staff.docs.map((d) => d.data().uid as string)]);
    await Promise.all([...to].slice(0, 12).map((t) =>
      pushNote(t, uid, `group_request_${group.id}`, "group_request", { groupId: group.id, groupName: group.name })));
  } catch { /* not told, but the request stands */ }
}

/** Takes your own request back. */
export const cancelRequest = (uid: string, gid: string) => deleteDoc(requestRef(gid, uid));

/** Your request to a group: undefined while loading, null when you have none. */
export function useMyRequest(uid: string, gid: string, enabled = true): JoinRequest | null | undefined {
  const [req, setReq] = useState<JoinRequest | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) { setReq(null); return; }
    setReq(undefined);
    return onSnapshot(requestRef(gid, uid), (s) => setReq(s.exists() ? toRequest(uid, s.data()) : null), () => setReq(null));
  }, [uid, gid, enabled]);
  return req;
}

function toRequest(uid: string, d: Record<string, unknown>): JoinRequest {
  const t = d.createdAt as Timestamp | null | undefined;
  return {
    uid, message: (d.message as string) ?? "",
    answers: Array.isArray(d.answers) ? (d.answers as unknown[]).map((a) => String(a)) : [],
    createdAt: t?.toMillis?.() ?? Date.now(),
  };
}

/** Live requests waiting for an admin or moderator, oldest first. null while loading. */
export function useJoinRequests(gid: string, enabled: boolean): { requests: JoinRequest[] | null; error: string } {
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) { setRequests([]); return; }
    setRequests(null); setError("");
    return onSnapshot(
      query(collection(db, "groups", gid, "requests"), orderBy("createdAt", "asc"), limit(100)),
      (snap) => setRequests(snap.docs.map((d) => toRequest(d.id, d.data()))),
      () => { setRequests([]); setError("Could not load join requests."); },
    );
  }, [gid, enabled]);
  return { requests, error };
}

/** Lets the person in and clears their request in one step, then tells them. Admins and moderators only. */
export async function approveRequest(by: string, group: Pick<Group, "id" | "name">, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(memberRef(group.id, uid), { groupId: group.id, uid, role: "member", joinedAt: serverTimestamp() });
  batch.delete(requestRef(group.id, uid));
  await batch.commit();
  await pushNote(uid, by, `group_approved_${group.id}`, "group_approved", { groupId: group.id, groupName: group.name });
}

export const declineRequest = (gid: string, uid: string) => deleteDoc(requestRef(gid, uid));

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

/** The tiers of a group, top to bottom: the owner, then admins, moderators and plain members. Empty tiers are left out. */
export type RoleTier<T extends Member> = { id: "owner" | GroupRole; label: string; members: T[] };
export function roleTiers<T extends Member>(members: T[], ownerUid: string): RoleTier<T>[] {
  const tiers: RoleTier<T>[] = [
    { id: "owner", label: "Owner", members: members.filter((m) => m.uid === ownerUid) },
    { id: "admin", label: "Admins", members: members.filter((m) => m.uid !== ownerUid && m.role === "admin") },
    { id: "moderator", label: "Moderators", members: members.filter((m) => m.role === "moderator" && m.uid !== ownerUid) },
    { id: "member", label: "Members", members: members.filter((m) => m.role === "member" && m.uid !== ownerUid) },
  ];
  return tiers.filter((t) => t.members.length > 0);
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
  gid: string, name: string, description: string, photos: Partial<Pick<Group, "avatar" | "coverPhoto" | "cover">>,
  access?: { privacy: GroupPrivacy; questions: string[] },
): Promise<void> {
  const clean = { name: clip(name.trim(), GROUP_NAME_MAX), description: clip(description.trim(), GROUP_DESC_MAX) };
  const rules = access ? { privacy: access.privacy, questions: cleanQuestions(access.questions, access.privacy) } : {};
  await updateDoc(doc(db, "groups", gid), { ...clean, nameKeys: nameKeys(clean.name), ...photos, ...rules });
  cache.delete(gid);
  editListeners.forEach((f) => f());
}

/** Admins: sets, replaces or (with "") removes the group's picture and cover photo. */
export async function updateGroupPhotos(gid: string, change: Partial<Pick<Group, "avatar" | "coverPhoto" | "cover">>): Promise<void> {
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

/** Owner only: notifies every member that the group was deleted, removes memberships/invites/requests/posts, and deletes the group document. */
export async function deleteGroup(ownerUid: string, group: Pick<Group, "id" | "name" | "ownerUid">): Promise<void> {
  if (group.ownerUid !== ownerUid) throw new Error("Only the group owner can delete this group.");
  const memberUids = await loadMembers(group.id);

  const [membersSnap, invitesSnap, requestsSnap, bansSnap, postsSnap] = await Promise.all([
    getDocs(query(collection(db, "groupMembers"), where("groupId", "==", group.id))),
    getDocs(query(collection(db, "groupInvites"), where("groupId", "==", group.id))),
    getDocs(collection(db, "groups", group.id, "requests")),
    getDocs(collection(db, "groups", group.id, "bans")),
    getDocs(collection(db, "groups", group.id, "posts")),
  ]);

  const refs = [
    ...membersSnap.docs.map((d) => d.ref),
    ...invitesSnap.docs.map((d) => d.ref),
    ...requestsSnap.docs.map((d) => d.ref),
    ...bansSnap.docs.map((d) => d.ref),
    ...postsSnap.docs.map((d) => d.ref),
    doc(db, "groups", group.id),
  ];

  for (let i = 0; i < refs.length; i += 200) {
    const batch = writeBatch(db);
    refs.slice(i, i + 200).forEach((r) => batch.delete(r));
    await batch.commit();
  }

  // Notify only once the group is really gone, so nobody hears about a deletion that failed half way.
  await Promise.all(
    memberUids
      .filter((uid) => uid !== ownerUid)
      .map((uid) => pushNote(uid, ownerUid, `group_deleted_${group.id}`, "group_deleted", { groupId: group.id, groupName: group.name })),
  );

  cache.delete(group.id);
  editListeners.forEach((f) => f());
  logActivity(ownerUid, `Deleted the group “${group.name}”`);
}
