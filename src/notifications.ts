import { useEffect, useMemo, useState } from "react";
import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch, type Timestamp,
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
  | "friend_request" | "friend_accept" | "follow" | "group_invite" | "group_request" | "group_approved"
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

const MAX_NOTES = 100;

/** Live notifications for the signed-in person, newest first. */
export function useNotes(uid: string): Note[] {
  const [notes, setNotes] = useState<Note[]>([]);
  useEffect(
    () => onSnapshot(
      query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"), limit(MAX_NOTES)),
      (snap) => setNotes(snap.docs.map((d) => {
        const x = d.data();
        const t = x.createdAt as Timestamp | null;
        return {
          id: d.id, type: x.type, actorUid: x.actorUid, createdAt: t ? t.toMillis() : Date.now(), read: x.read === true,
          ownerUid: x.ownerUid, entryId: x.entryId, photoId: x.photoId, title: x.title, groupId: x.groupId, groupName: x.groupName,
        } as Note;
      })),
      () => setNotes([]),
    ),
    [uid],
  );
  return notes;
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
    case "group_invite": return "#/groups";
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
