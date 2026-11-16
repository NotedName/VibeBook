import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { clip } from "./text";
import { interactionWeight, noteInteraction } from "./closeFriends";

/**
 * Notifications live at users/{recipient}/notifications/{actorUid}_{key}. The person who did the thing
 * writes the document (firestore.rules checks it is really them), the recipient reads, marks it read
 * and deletes it. Writing one is best effort: if it fails, the like or comment itself still went through.
 */
export type NoteType =
  | "friend_request" | "friend_accept" | "follow" | "group_invite" | "group_request" | "group_approved" | "group_deleted"
  | "like" | "comment" | "reply" | "comment_like" | "repost";

export type Note = {
  id: string;
  type: NoteType;
  actorUid: string;
  /** ms since 1970 */
  createdAt: number;
  read: boolean;
  /** whose entry it is about */
  ownerUid?: string;
  entryId?: string;
  photoId?: string;
  title?: string;
  groupId?: string;
  groupName?: string;
};

export type NoteFields = Partial<Pick<Note, "ownerUid" | "entryId" | "photoId" | "title" | "groupId" | "groupName">>;

const noteRef = (to: string, id: string) => doc(db, "users", to, "notifications", id);

/** Tells `to` that `actor` did something. `key` makes the id unique per actor and action, so repeating it cannot pile up. */
export async function pushNote(to: string, actor: string, key: string, type: NoteType, fields: NoteFields = {}): Promise<void> {
  if (!to || to === actor) return;
  noteInteraction(actor, to, interactionWeight(type)); // feeds "most interacted friends"
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) if (typeof v === "string" && v) data[k] = k === "title" ? clip(v, 140) : clip(v, 60 + (k === "groupName" ? 0 : 80));
  try {
    await setDoc(noteRef(to, `${actor}_${key}`), { type, actorUid: actor, ...data, createdAt: serverTimestamp(), read: false });
  } catch { /* best effort */ }
}

/** Takes a notification back, e.g. when a like is undone or a request cancelled. */
export async function dropNote(to: string, actor: string, key: string): Promise<void> {
  if (!to || to === actor) return;
  try { await deleteDoc(noteRef(to, `${actor}_${key}`)); } catch { /* already gone */ }
}

/**
 * Marks notifications as read. Each one is its own update, not a single batch: a batch is all-or-nothing, so one
 * notification the sender had just taken back (an undone like) made "Mark all as read" fail for every other one.
 * A notification that no longer exists counts as done; any other failure is reported.
 */
export async function markRead(uid: string, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const results = await Promise.allSettled(unique.map((id) => updateDoc(noteRef(uid, id), { read: true })));
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected" && (r.reason as { code?: string })?.code !== "not-found");
  if (failed) throw failed.reason;
}

export const removeNotes = (uid: string, ids: string[]) => {
  if (ids.length === 0) return Promise.resolve();
  const batch = writeBatch(db);
  ids.slice(0, 400).forEach((id) => batch.delete(noteRef(uid, id)));
  return batch.commit();
};

/** How many of the newest notifications are kept live (read from the server) at once. */
const MAX_NOTES = 60;
/** Read notifications older than this are deleted from the account. */
const READ_KEEP_MS = 30 * 864e5;
/** Anything older than this is deleted, read or not. */
const ANY_KEEP_MS = 90 * 864e5;
/** Cleaning up runs at most this often per device. */
const PRUNE_EVERY_MS = 12 * 36e5;
const PRUNE_PAGE = 200;

const toNote = (d: QueryDocumentSnapshot): Note => {
  const x = d.data();
  const t = x.createdAt as Timestamp | null;
  return {
    id: d.id, type: x.type, actorUid: x.actorUid, createdAt: t ? t.toMillis() : Date.now(), read: x.read === true,
    ownerUid: x.ownerUid, entryId: x.entryId, photoId: x.photoId, title: x.title, groupId: x.groupId, groupName: x.groupName,
  } as Note;
};

/**
 * Culling: old notifications are removed for good so the list the server has to load stays small. Read ones go after
 * 30 days, any after 90. It runs once per device every 12 hours, a page at a time, and is best effort.
 */
export async function pruneNotes(uid: string): Promise<void> {
  const stamp = `vibebook.notesPruned.${uid}`;
  try { if (Date.now() - Number(localStorage.getItem(stamp) ?? 0) < PRUNE_EVERY_MS) return; } catch { /* storage blocked: just run */ }
  try {
    const now = Date.now();
    const old = await getDocs(query(
      collection(db, "users", uid, "notifications"),
      where("createdAt", "<", Timestamp.fromMillis(now - READ_KEEP_MS)), orderBy("createdAt", "asc"), limit(PRUNE_PAGE),
    ));
    const stale = old.docs.filter((d) => d.data().read === true || (d.data().createdAt as Timestamp).toMillis() < now - ANY_KEEP_MS).map((d) => d.id);
    await removeNotes(uid, stale);
    // A full page means there may be more: leave the stamp alone so the next start carries on.
    if (old.size < PRUNE_PAGE) { try { localStorage.setItem(stamp, String(now)); } catch { /* not remembered */ } }
  } catch { /* best effort */ }
}

type NotesSnap = { notes: Note[]; ready: boolean };
const EMPTY: NotesSnap = { notes: [], ready: false };
type NotesStore = { snap: NotesSnap; subs: Set<() => void>; stop: () => void };
const stores = new Map<string, NotesStore>();

/** One live query per person, shared by everything that shows notifications (the bell, the side column, the invite list). */
function subscribeNotes(uid: string, cb: () => void): () => void {
  let st = stores.get(uid);
  if (!st) {
    const made: NotesStore = { snap: EMPTY, subs: new Set(), stop: () => {} };
    const emit = (snap: NotesSnap) => { made.snap = snap; made.subs.forEach((f) => f()); };
    made.stop = onSnapshot(
      query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"), limit(MAX_NOTES)),
      (snap) => emit({ notes: snap.docs.map(toNote), ready: true }),
      () => emit({ notes: [], ready: true }),
    );
    stores.set(uid, made);
    st = made;
    void pruneNotes(uid);
  }
  st.subs.add(cb);
  const mine = st;
  return () => {
    mine.subs.delete(cb);
    if (mine.subs.size === 0) { mine.stop(); if (stores.get(uid) === mine) stores.delete(uid); }
  };
}

/** Live notifications for the signed-in person, newest first. */
export function useNotes(uid: string): Note[] {
  return useNotesState(uid).notes;
}

/** Same as useNotes, plus `ready`: false until the server has answered the first time (so a list can show a skeleton). */
export function useNotesState(uid: string): { notes: Note[]; ready: boolean } {
  const subscribe = useCallback((cb: () => void) => subscribeNotes(uid, cb), [uid]);
  return useSyncExternalStore(subscribe, () => stores.get(uid)?.snap ?? EMPTY);
}

/** More than this many of one kind collapse into a single notification. */
export const COMPILE_OVER = 3;

export type NoteItem = {
  key: string;
  type: NoteType;
  notes: Note[];
  /** distinct people, newest first */
  actors: string[];
  time: number;
  unread: boolean;
  /** true when several notifications were folded into this one */
  compiled: boolean;
};

const ENTRY_TYPES = new Set<NoteType>(["like", "comment", "reply", "comment_like", "repost"]);

/** What notifications are about: the kind of request for people-things, the kind plus the entry for entry-things. */
const subjectOf = (n: Note) =>
  ENTRY_TYPES.has(n.type) ? `${n.type}:${n.ownerUid}/${n.entryId}`
  : n.type === "group_request" || n.type === "group_approved" ? `${n.type}:${n.groupId}`
  : n.type;

/**
 * Folds notifications by subject (all friend requests, all likes on one entry, …). A subject with
 * more than COMPILE_OVER notifications becomes one item; fewer stay separate. Newest first.
 */
export function compileNotes(notes: Note[]): NoteItem[] {
  const buckets = new Map<string, Note[]>();
  for (const n of [...notes].sort((a, b) => b.createdAt - a.createdAt)) {
    const k = subjectOf(n);
    const list = buckets.get(k);
    if (list) list.push(n); else buckets.set(k, [n]);
  }
  const out: NoteItem[] = [];
  const make = (key: string, list: Note[], compiled: boolean): NoteItem => ({
    key, type: list[0].type, notes: list, compiled,
    actors: [...new Set(list.map((n) => n.actorUid))],
    time: list[0].createdAt, unread: list.some((n) => !n.read),
  });
  buckets.forEach((list, k) => {
    if (list.length > COMPILE_OVER) out.push(make(k, list, true));
    else list.forEach((n) => out.push(make(n.id, [n], false)));
  });
  return out.sort((a, b) => b.time - a.time);
}

/** Where tapping a notification goes. */
export function noteHref(item: NoteItem): string {
  const n = item.notes[0];
  switch (n.type) {
    case "friend_request": return "#/people";
    case "group_invite": case "group_deleted": return "#/groups";
    case "group_request": case "group_approved": return n.groupId ? `#/g/${encodeURIComponent(n.groupId)}` : "#/groups";
    case "follow": case "friend_accept": return item.compiled ? "#/people" : `#/u/${encodeURIComponent(n.actorUid)}`;
    default: return n.ownerUid && n.entryId ? `#/p/${encodeURIComponent(n.ownerUid)}/${encodeURIComponent(n.entryId)}` : "#/feed";
  }
}

/** "5m", "3h", "2d", or a date. */
export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Memoised grouping, for the bell. */
export function useNoteItems(notes: Note[]) {
  return useMemo(() => compileNotes(notes), [notes]);
}
