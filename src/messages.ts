import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  collection, deleteDoc, deleteField, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
  type DocumentData, type QueryDocumentSnapshot, type SnapshotOptions,
} from "firebase/firestore";
import { db } from "./firebase";
import { usePreferences } from "./preferences";
import { pairId } from "./social";
import { isGifUrl } from "./stickers";

/**
 * Direct messages between two friends. One conversation per pair, named like their friendship ("<uidA>_<uidB>", sorted):
 *   conversations/{pairId}            members, lastText, lastFrom, updatedAt, seen { <uid>: when that person last read }
 *   conversations/{pairId}/messages/* from, text, createdAt, and optionally image (a small JPEG data URL) or gif (a Giphy/Tenor link)
 *   conversations/{pairId}/settings/shared  the emoji and nicknames both people see (see ChatSettings)
 *   users/{me}/chatPrefs/{otherUid}   only yours: archivedAt, mutedUntil, clearedAt ("delete chat"), readAt, receipts
 *   users/{me}/blocked/{otherUid}     people you blocked: neither of you can write to the other's chat
 * firestore.rules only lets friends write, and only the two people in a conversation can read it.
 */
export const MESSAGE_MAX = 2000;
const PREVIEW_MAX = 120;
export const PAGE = 50;
/** How many of the newest messages are loaded while searching inside a conversation. */
export const SEARCH_WINDOW = 300;
/** Longest picture (as a data URL) a message may carry. firestore.rules checks the same number. */
export const IMAGE_MAX_CHARS = 300_000;

/** `pending`: written on this device but not yet confirmed by the server (it is still sending, or waiting for a connection). */
export type Message = { id: string; from: string; text: string; at: number; image: string; gif: string; pending: boolean };
export type Conversation = {
  id: string; other: string; lastText: string; lastFrom: string; updatedAt: number; seenAt: number; otherSeenAt: number;
  /** when you last marked it read without sending a read receipt (0 = never) */
  readAt: number;
  /** notifications are off: no unread count in the top bar (a timed mute that ran out does not count) */
  muted: boolean;
  /** you blocked this person */
  blocked: boolean;
};

/** What only you decide about a chat. Times are milliseconds, 0 = not set. */
export type ChatPrefs = {
  archivedAt: number;
  /** muted until this time; MUTE_FOREVER until you turn it back on */
  mutedUntil: number;
  /** "Delete chat": messages up to this time are hidden from you (the other person keeps theirs) */
  clearedAt: number;
  readAt: number;
  /** let the other person see when you read their messages (and see when they read yours) */
  receipts: boolean;
};
export const NO_PREFS: ChatPrefs = { archivedAt: 0, mutedUntil: 0, clearedAt: 0, readAt: 0, receipts: true };
export const MUTE_FOREVER = 32_503_680_000_000; // 1 Jan 3000

/** Conversations of the signed-in person. `list` is the inbox; `archived` is what you tucked away; `all` has both (and chats you deleted). */
export type Chats = {
  ready: boolean; error: string; list: Conversation[]; archived: Conversation[]; all: Conversation[]; unread: number;
  prefsOf: (other: string) => ChatPrefs;
  blocked: Set<string>;
};

const estimate: SnapshotOptions = { serverTimestamps: "estimate" };
const millis = (v: unknown) => (v as Timestamp | undefined)?.toMillis() ?? 0;

export const isUnread = (c: Conversation, uid: string) => c.lastFrom !== uid && c.updatedAt > Math.max(c.seenAt, c.readAt);

const isMuted = (p: ChatPrefs, localMute: boolean, now: number) => localMute || p.mutedUntil > now;
/** Archived until something new arrives, like Messenger. */
const isArchived = (c: { updatedAt: number }, p: ChatPrefs) => p.archivedAt > 0 && c.updatedAt <= p.archivedAt;
/** Deleted by you until something new arrives. */
const isCleared = (c: { updatedAt: number }, p: ChatPrefs) => p.clearedAt > 0 && c.updatedAt <= p.clearedAt;

function toPrefs(data: DocumentData): ChatPrefs {
  return {
    archivedAt: millis(data.archivedAt), mutedUntil: millis(data.mutedUntil), clearedAt: millis(data.clearedAt),
    readAt: millis(data.readAt), receipts: data.receipts !== false,
  };
}

/** Your chat preferences and the people you blocked, live. Both fall back to "nothing set" if the rules are not deployed yet. */
function useChatPrefs(uid: string) {
  const [prefs, setPrefs] = useState<Map<string, ChatPrefs>>(new Map());
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  useEffect(() => {
    const none = () => undefined;
    const a = onSnapshot(collection(db, "users", uid, "chatPrefs"),
      (snap) => setPrefs(new Map(snap.docs.map((d) => [d.id, toPrefs(d.data(estimate))]))), none);
    const b = onSnapshot(collection(db, "users", uid, "blocked"),
      (snap) => setBlocked(new Set(snap.docs.map((d) => d.id))), none);
    return () => { a(); b(); };
  }, [uid]);
  return { prefs, blocked };
}

function toConversation(uid: string, d: QueryDocumentSnapshot<DocumentData>): Conversation {
  const data = d.data(estimate);
  const other = (data.members as string[]).find((m) => m !== uid)!;
  const seen = data.seen as Record<string, unknown> | undefined;
  return {
    id: d.id,
    other,
    lastText: data.lastText as string,
    lastFrom: data.lastFrom as string,
    updatedAt: millis(data.updatedAt),
    seenAt: millis(seen?.[uid]),
    otherSeenAt: millis(seen?.[other]),
    readAt: 0, muted: false, blocked: false,
  };
}

/** Live conversations of the signed-in person, newest first. Subscribed once per session (Shell). */
export function useConversations(uid: string): Chats {
  const [raw, setRaw] = useState<Conversation[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const { prefs, blocked } = useChatPrefs(uid);
  const { mutedChats } = usePreferences(); // chats muted before timed mutes existed (kept on this device)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => onSnapshot(
    query(collection(db, "conversations"), where("members", "array-contains", uid), orderBy("updatedAt", "desc")),
    (snap) => { setRaw(snap.docs.map((d) => toConversation(uid, d))); setError(""); setReady(true); },
    () => { setError("Could not load messages. If you just updated the app, deploy the Firestore rules and indexes first (npm run deploy)."); setReady(true); },
  ), [uid]);

  // A timed mute ends by itself: look again when the next one runs out.
  const nextEnd = useMemo(() => {
    let t = Infinity;
    prefs.forEach((p) => { if (p.mutedUntil > now && p.mutedUntil < MUTE_FOREVER && p.mutedUntil < t) t = p.mutedUntil; });
    return t;
  }, [prefs, now]);
  useEffect(() => {
    if (nextEnd === Infinity) return;
    const id = setTimeout(() => setNow(Date.now()), Math.min(nextEnd - Date.now() + 500, 2_000_000_000));
    return () => clearTimeout(id);
  }, [nextEnd]);

  const prefsOf = useCallback((other: string) => prefs.get(other) ?? NO_PREFS, [prefs]);
  const all = useMemo(() => raw.map((c) => {
    const p = prefs.get(c.other) ?? NO_PREFS;
    return { ...c, readAt: p.readAt, muted: isMuted(p, mutedChats.includes(c.other), now), blocked: blocked.has(c.other) };
  }), [raw, prefs, blocked, mutedChats, now]);
  const list = useMemo(() => all.filter((c) => { const p = prefsOf(c.other); return !isCleared(c, p) && !isArchived(c, p); }), [all, prefsOf]);
  const archived = useMemo(() => all.filter((c) => { const p = prefsOf(c.other); return !isCleared(c, p) && isArchived(c, p); }), [all, prefsOf]);
  const unread = useMemo(() => list.filter((c) => isUnread(c, uid) && !c.muted && !c.blocked).length, [list, uid]);
  return { ready, error, list, archived, all, unread, prefsOf, blocked };
}

/**
 * The newest `count` messages of one conversation, oldest first, and whether there are older ones.
 * `since` hides messages up to that time (what "Delete chat" does for you); it is applied here, not in the query, so a message
 * you just sent shows at once.
 */
export function useMessages(me: string, other: string, count: number, since = 0) {
  const [state, setState] = useState<{ messages: Message[]; hasMore: boolean; loading: boolean; error: string }>(
    { messages: [], hasMore: false, loading: true, error: "" },
  );
  useEffect(() => onSnapshot(
    query(collection(db, "conversations", pairId(me, other), "messages"), orderBy("createdAt", "desc"), limit(count)),
    { includeMetadataChanges: true }, // so a message flips from sending to sent the moment the server confirms it
    (snap) => setState({
      messages: snap.docs.map((d) => {
        const data = d.data(estimate);
        return {
          id: d.id, from: data.from as string, text: data.text as string, at: millis(data.createdAt),
          image: (data.image as string | undefined) ?? "", gif: (data.gif as string | undefined) ?? "",
          pending: d.metadata.hasPendingWrites,
        };
      }).reverse(),
      hasMore: snap.size >= count,
      loading: false,
      error: "",
    }),
    () => setState({ messages: [], hasMore: false, loading: false, error: "Could not load this conversation." }),
  ), [me, other, count]);
  const messages = useMemo(() => (since > 0 ? state.messages.filter((m) => m.at > since) : state.messages), [state.messages, since]);
  return { ...state, messages };
}

/** What to send: some text, a picture, a GIF link, or text with either. */
export type Outgoing = { text?: string; image?: string; gif?: string };

/** Adds the message and updates the conversation's preview in one step. Throws when there is nothing to send or it is too big. */
export async function sendMessage(me: string, other: string, out: Outgoing) {
  const body = (out.text ?? "").trim();
  const image = out.image ?? "";
  const gif = out.gif ?? "";
  if (!body && !image && !gif) throw new Error("Message is empty");
  if (body.length > MESSAGE_MAX) throw new Error(`Message is longer than ${MESSAGE_MAX} characters`);
  if (image && (!image.startsWith("data:image/") || image.length > IMAGE_MAX_CHARS)) throw new Error("That picture is too large to send");
  if (gif && !isGifUrl(gif)) throw new Error("That GIF link is not supported");
  const preview = body || (image ? "📷 Photo" : "GIF");
  const [a, b] = me < other ? [me, other] : [other, me];
  const convo = doc(db, "conversations", pairId(me, other));
  const batch = writeBatch(db);
  batch.set(convo, {
    members: [a, b], lastText: preview.slice(0, PREVIEW_MAX), lastFrom: me, updatedAt: serverTimestamp(), seen: { [me]: serverTimestamp() },
  }, { merge: true });
  const message: Record<string, unknown> = { from: me, text: body, createdAt: serverTimestamp() };
  if (image) message.image = image;
  if (gif) message.gif = gif;
  batch.set(doc(collection(convo, "messages")), message);
  await batch.commit();
}

/** Why a message could not be sent, in words for the person. */
export function failureReason(err: unknown): string {
  const code = (err as { code?: string }).code;
  if (code === "permission-denied") return "You can't message this person right now.";
  if (code === "unavailable") return "There is no connection.";
  if (err instanceof Error && !code) return err.message;
  return "Something went wrong.";
}

/** Records that you have read everything in this conversation up to now. The conversation must already exist. */
export const markConversationSeen = (me: string, other: string) =>
  updateDoc(doc(db, "conversations", pairId(me, other)), { [`seen.${me}`]: serverTimestamp() });

// ---------- what both people see: the quick emoji and nicknames ----------

export const DEFAULT_EMOJI = "👍";
export const NICK_MAX = 40;
/** `emoji` is what the quick-send button sends; `nick` maps a person's uid to the nickname given to them (either of you can change them). */
export type ChatSettings = { emoji: string; nick: Record<string, string> };
const NO_SETTINGS: ChatSettings = { emoji: DEFAULT_EMOJI, nick: {} };
const settingsRef = (me: string, other: string) => doc(db, "conversations", pairId(me, other), "settings", "shared");

// One listener per conversation, shared by everything on screen that needs it (the chat, and each row of the inbox).
const watched = new Map<string, { value: ChatSettings; subs: Set<() => void>; stop: () => void }>();
function watch(me: string, other: string, cb: () => void) {
  const id = pairId(me, other);
  let w = watched.get(id);
  if (!w) {
    const entry: { value: ChatSettings; subs: Set<() => void>; stop: () => void } = { value: NO_SETTINGS, subs: new Set(), stop: () => undefined };
    entry.stop = onSnapshot(settingsRef(me, other), (snap) => {
      const d = snap.data() ?? {};
      const nick: Record<string, string> = {};
      for (const [k, v] of Object.entries((d.nick ?? {}) as Record<string, unknown>)) if (typeof v === "string" && v) nick[k] = v;
      entry.value = { emoji: typeof d.emoji === "string" && d.emoji ? d.emoji : DEFAULT_EMOJI, nick };
      entry.subs.forEach((f) => f());
    }, () => undefined);
    watched.set(id, entry);
    w = entry;
  }
  w.subs.add(cb);
  return () => {
    const cur = watched.get(id);
    if (!cur) return;
    cur.subs.delete(cb);
    if (cur.subs.size === 0) { cur.stop(); watched.delete(id); }
  };
}

/** The emoji and nicknames of one conversation (the defaults until they load, or if the rules are not deployed yet). */
export function useChatSettings(me: string, other: string): ChatSettings {
  const subscribe = useCallback((cb: () => void) => watch(me, other, cb), [me, other]);
  const snapshot = useCallback(() => watched.get(pairId(me, other))?.value ?? NO_SETTINGS, [me, other]);
  return useSyncExternalStore(subscribe, snapshot);
}

export const setChatEmoji = (me: string, other: string, emoji: string) =>
  setDoc(settingsRef(me, other), { emoji }, { merge: true });
/** Gives `who` (you or the other person) a nickname in this conversation; an empty one takes it away. */
export const setNickname = (me: string, other: string, who: string, nickname: string) =>
  setDoc(settingsRef(me, other), { nick: { [who]: nickname.trim().slice(0, NICK_MAX) } }, { merge: true });

/** What to call someone in this conversation: their nickname here, otherwise their name. */
export const calledBy = (s: ChatSettings, uid: string, name: string) => s.nick[uid] || name;

// ---------- what only you decide: read state, mute, archive, delete, block ----------

const prefsRef = (me: string, other: string) => doc(db, "users", me, "chatPrefs", other);
const setPrefs = (me: string, other: string, change: Record<string, unknown>) => setDoc(prefsRef(me, other), change, { merge: true });

/**
 * Marks the chat read. With read receipts on, the other person sees it (`seen`); with them off it is only remembered for you (`readAt`).
 * The first needs the conversation to exist; the second works for any chat.
 */
export function markRead(me: string, other: string, receipts: boolean) {
  return receipts ? markConversationSeen(me, other) : setPrefs(me, other, { readAt: serverTimestamp() });
}
/** Mutes until `until` (milliseconds; MUTE_FOREVER for "until I turn it back on"), or unmutes with null. */
export const muteChat = (me: string, other: string, until: number | null) =>
  setPrefs(me, other, { mutedUntil: until === null ? deleteField() : Timestamp.fromMillis(until) });
export const archiveChat = (me: string, other: string, on: boolean) =>
  setPrefs(me, other, { archivedAt: on ? serverTimestamp() : deleteField() });
/** "Delete chat": hides everything so far from you. Their copy stays, and a new message brings the chat back. */
export const deleteChatForMe = (me: string, other: string) =>
  setPrefs(me, other, { clearedAt: serverTimestamp(), archivedAt: deleteField() });
export const setReadReceipts = (me: string, other: string, on: boolean) =>
  setPrefs(me, other, { receipts: on ? deleteField() : false });
export const blockPerson = (me: string, other: string) =>
  setDoc(doc(db, "users", me, "blocked", other), { createdAt: serverTimestamp() });
export const unblockPerson = (me: string, other: string) => deleteDoc(doc(db, "users", me, "blocked", other));
