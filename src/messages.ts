import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  addDoc, collection, deleteDoc, deleteField, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, startAfter, Timestamp, updateDoc, where, writeBatch,
  type DocumentData, type QueryDocumentSnapshot, type SnapshotOptions,
} from "firebase/firestore";
import { db } from "./firebase";
import { usePreferences } from "./preferences";
import { pairId } from "./social";
import { isGifUrl } from "./stickers";
import { takeTurn } from "./rateLimit";
import { openFrom, sealFor, useE2ee, type Payload, type ReplyRef } from "./e2ee";
export type { ReplyRef } from "./e2ee";

/**
 * Direct messages between two friends. One conversation per pair, named like their friendship ("<uidA>_<uidB>", sorted):
 *   conversations/{pairId}            members, lastEnc (the preview, encrypted), lastFrom, updatedAt, seen { <uid>: when that person last read }
 *   conversations/{pairId}/messages/* from, createdAt and enc: the text, picture (a small JPEG data URL) and GIF link, end-to-end
 *                                     encrypted (see e2ee.ts). Messages from before encryption have plain text/image/gif instead.
 *   conversations/{pairId}/settings/shared  the emoji and nicknames both people see (see ChatSettings)
 *   conversations/{pairId}/reactions/{messageId}_{uid}  one emoji reaction per person per message (the emoji is encrypted)
 *   conversations/{pairId}/pins/{messageId}  messages either of you pinned (a short encrypted copy, so the list needs no history)
 *   messageReports/*                   a report of one message, written by the person who reports it (they choose what to include)
 * A message's author can edit it (new `enc`, plus `editedAt`) or unsend it (`unsent: true`, `enc` emptied).
 *   users/{me}/chatPrefs/{otherUid}   only yours: archivedAt, mutedUntil, clearedAt ("delete chat"), readAt, receipts
 *   users/{me}/blocked/{otherUid}     people you blocked: neither of you can write to the other's chat
 *   users/{me}/restricted/{otherUid}  people you restricted (like Messenger): their chat moves to your message requests, gives no
 *                                     notifications, and they cannot see when you read it. Only you can see this list; they are not told
 * firestore.rules only lets friends write, and only the two people in a conversation can read it.
 */
export const MESSAGE_MAX = 2000;
const PREVIEW_MAX = 120;
export const PAGE = 50;
/** How many of the newest messages are loaded while searching inside a conversation. */
export const SEARCH_WINDOW = 300;
/** Longest picture (as a data URL) a message may carry. It is inside the encrypted message, so only the app can check it. */
export const IMAGE_MAX_CHARS = 300_000;

/** `pending`: written on this device but not yet confirmed by the server (it is still sending, or waiting for a connection). */
export type Message = {
  id: string; from: string; text: string; at: number; image: string; gif: string; pending: boolean;
  /** the message this one answers */
  reply: ReplyRef | null;
  /** passed on from another chat */
  fwd: boolean;
  /** the author changed the text after sending */
  edited: boolean;
  /** the author took it back: there is nothing left to show but that it was unsent */
  unsent: boolean;
};
export type Conversation = {
  id: string; other: string; lastText: string;
  /** the encrypted preview; lastText is filled in from it once it has been decrypted */
  lastEnc: string; lastFrom: string; updatedAt: number; seenAt: number; otherSeenAt: number;
  /** when you last marked it read without sending a read receipt (0 = never) */
  readAt: number;
  /** notifications are off: no unread count in the top bar (a timed mute that ran out does not count) */
  muted: boolean;
  /** you blocked this person */
  blocked: boolean;
  /** you restricted this person: the chat sits in your message requests, silently, and nothing you read is reported to them */
  restricted: boolean;
  /** who sent the first message ("" for chats from before requests existed) */
  startedBy: string;
  /** the person who did not start the chat said yes to a message request */
  accepted: boolean;
  /** a message request for you: they are not your friend, started the chat, and you have not accepted yet */
  request: boolean;
  /** you sent a message request that has not been accepted: you cannot send more until it is */
  waiting: boolean;
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
  /** message requests from people who are not your friends and whose chat you have not accepted */
  requests: Conversation[];
  prefsOf: (other: string) => ChatPrefs;
  blocked: Set<string>;
  restricted: Set<string>;
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

/** Your chat preferences and the people you blocked or restricted, live. All fall back to "nothing set" if the rules are not deployed yet. */
function useChatPrefs(uid: string) {
  const [prefs, setPrefs] = useState<Map<string, ChatPrefs>>(new Map());
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [restricted, setRestricted] = useState<Set<string>>(new Set());
  useEffect(() => {
    const none = () => undefined;
    const a = onSnapshot(collection(db, "users", uid, "chatPrefs"),
      (snap) => setPrefs(new Map(snap.docs.map((d) => [d.id, toPrefs(d.data(estimate))]))), none);
    const b = onSnapshot(collection(db, "users", uid, "blocked"),
      (snap) => setBlocked(new Set(snap.docs.map((d) => d.id))), none);
    const c = onSnapshot(collection(db, "users", uid, "restricted"),
      (snap) => setRestricted(new Set(snap.docs.map((d) => d.id))), none);
    return () => { a(); b(); c(); };
  }, [uid]);
  return { prefs, blocked, restricted };
}

/** Whether `other` blocked you, live (false until it loads, or if the rules are not deployed yet). */
export function useBlockedBy(me: string, other: string): boolean {
  const [blockedBy, setBlockedBy] = useState(false);
  useEffect(() => {
    setBlockedBy(false);
    return onSnapshot(doc(db, "users", other, "blocked", me), (snap) => setBlockedBy(snap.exists()), () => setBlockedBy(false));
  }, [me, other]);
  return blockedBy;
}

const LOCKED_PREVIEW = "🔒 Encrypted message";
const previewKey = (c: Conversation) => `${c.id}:${c.lastEnc.slice(0, 24)}`;

function toConversation(uid: string, d: QueryDocumentSnapshot<DocumentData>): Conversation {
  const data = d.data(estimate);
  const other = (data.members as string[]).find((m) => m !== uid)!;
  const seen = data.seen as Record<string, unknown> | undefined;
  return {
    id: d.id,
    other,
    lastText: (data.lastText as string | undefined) ?? "",
    lastEnc: (data.lastEnc as string | undefined) ?? "",
    lastFrom: data.lastFrom as string,
    updatedAt: millis(data.updatedAt),
    seenAt: millis(seen?.[uid]),
    otherSeenAt: millis(seen?.[other]),
    readAt: 0, muted: false, blocked: false, restricted: false,
    startedBy: (data.startedBy as string | undefined) ?? "", accepted: data.accepted === true, request: false, waiting: false,
  };
}

/** Live conversations of the signed-in person, newest first. Subscribed once per session (Shell). */
export function useConversations(uid: string, friends: Set<string>): Chats {
  const [raw, setRaw] = useState<Conversation[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const { prefs, blocked, restricted } = useChatPrefs(uid);
  const { mutedChats } = usePreferences(); // chats muted before timed mutes existed (kept on this device)
  const keys = useE2ee().phase;
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => onSnapshot(
    query(collection(db, "conversations"), where("members", "array-contains", uid), orderBy("updatedAt", "desc")),
    (snap) => { setRaw(snap.docs.map((d) => toConversation(uid, d))); setError(""); setReady(true); },
    () => { setError("Could not load messages. If you just updated the app, deploy the Firestore rules and indexes first (npm run deploy)."); setReady(true); },
  ), [uid]);

  // Previews are encrypted like messages: decrypt them as they arrive, and again once the keys are unlocked.
  useEffect(() => {
    let live = true;
    Promise.all(raw.filter((c) => c.lastEnc).map(async (c) => {
      const text = await openFrom(c.other, c.lastEnc).then((p) => p.text ?? "", () => LOCKED_PREVIEW);
      return [previewKey(c), text] as const;
    })).then((entries) => live && setPreviews(new Map(entries)));
    return () => { live = false; };
  }, [raw, keys]);

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
    const open = friends.has(c.other) || c.startedBy === "" || c.accepted;
    return {
      ...c, lastText: c.lastEnc ? previews.get(previewKey(c)) ?? LOCKED_PREVIEW : c.lastText, readAt: p.readAt, muted: isMuted(p, mutedChats.includes(c.other), now), blocked: blocked.has(c.other), restricted: restricted.has(c.other),
      request: !open && c.startedBy !== uid, waiting: !open && c.startedBy === uid,
    };
  }), [raw, previews, prefs, blocked, restricted, mutedChats, now, friends, uid]);
  const shown = useMemo(() => all.filter((c) => !isCleared(c, prefsOf(c.other))), [all, prefsOf]);
  // A restricted chat sits with the message requests (quietly), but is otherwise a normal open chat.
  const requests = useMemo(() => shown.filter((c) => (c.request || c.restricted) && !c.blocked), [shown]);
  const list = useMemo(() => shown.filter((c) => !c.request && !c.restricted && !isArchived(c, prefsOf(c.other))), [shown, prefsOf]);
  const archived = useMemo(() => shown.filter((c) => !c.request && !c.restricted && isArchived(c, prefsOf(c.other))), [shown, prefsOf]);
  const unread = useMemo(() => list.filter((c) => isUnread(c, uid) && !c.muted && !c.blocked).length, [list, uid]);
  return { ready, error, list, requests, archived, all, unread, prefsOf, blocked, restricted };
}

type RawMessage = { id: string; from: string; at: number; pending: boolean; enc: string; text: string; image: string; gif: string; edited: boolean; unsent: boolean };

/** Shown instead of a message that cannot be read: the keys are still locked, or it was sent before the key was reset. */
const unreadable = (unlocked: boolean) => (unlocked ? "🔒 This message can't be decrypted. Its encryption key was reset." : "🔒 Encrypted message. Unlock your messages to read it.");

async function open(other: string, m: RawMessage, unlocked: boolean): Promise<Message> {
  const { id, from, at, pending, edited, unsent } = m;
  const base = { id, from, at, pending, edited, unsent, reply: null, fwd: false };
  if (unsent) return { ...base, text: "", image: "", gif: "" };
  if (!m.enc) return { ...base, text: m.text, image: m.image, gif: m.gif }; // sent before messages were encrypted
  try {
    const p = await openFrom(other, m.enc);
    return { ...base, text: p.text ?? "", image: p.image ?? "", gif: p.gif ?? "", reply: p.reply ?? null, fwd: p.fwd === true };
  } catch {
    return { ...base, text: unreadable(unlocked), image: "", gif: "" };
  }
}

type MessageSnap = QueryDocumentSnapshot<DocumentData>;
const toRawMessage = (d: MessageSnap): RawMessage => {
  const data = d.data(estimate);
  return {
    id: d.id, from: data.from as string, at: millis(data.createdAt), pending: d.metadata.hasPendingWrites,
    enc: (data.enc as string | undefined) ?? "", text: (data.text as string | undefined) ?? "",
    image: (data.image as string | undefined) ?? "", gif: (data.gif as string | undefined) ?? "",
    edited: millis(data.editedAt) > 0, unsent: data.unsent === true,
  };
};

/**
 * The newest `count` messages of one conversation, oldest first, and whether there are older ones. Messages are decrypted here.
 * `since` hides messages up to that time (what "Delete chat" does for you); it is applied here, not in the query, so a message
 * you just sent shows at once.
 *
 * To keep database reads low, only the newest PAGE messages are listened to live. Older pages are read once each, continuing
 * from the oldest message already loaded, so loading more never re-reads what is on screen. Older messages are therefore not
 * live: an edit or unsend of one shows the next time the chat is opened.
 */
export function useMessages(me: string, other: string, count: number, since = 0) {
  const [state, setState] = useState<{ raw: RawMessage[]; hasMore: boolean; loading: boolean; error: string }>(
    { raw: [], hasMore: false, loading: true, error: "" },
  );
  const [opened, setOpened] = useState<Message[] | null>(null);
  const unlocked = useE2ee().phase === "ready";
  const cache = useRef(new Map<string, { raw: RawMessage; snap: MessageSnap }>()); // every message seen, so one that slides out of the live window is kept
  const exhausted = useRef(false);
  const fetching = useRef(false);
  const fetchedOlder = useRef(false);
  const generation = useRef(0);

  const publish = useCallback((error = "") => {
    const all = [...cache.current.values()].sort((x, y) => x.raw.at - y.raw.at || (x.raw.id < y.raw.id ? -1 : 1));
    setState({ raw: all.map((e) => e.raw), hasMore: !exhausted.current, loading: false, error });
  }, []);

  useEffect(() => {
    generation.current++;
    cache.current = new Map(); exhausted.current = false; fetching.current = false; fetchedOlder.current = false;
    setState({ raw: [], hasMore: false, loading: true, error: "" });
    setOpened(null);
    return onSnapshot(
      query(collection(db, "conversations", pairId(me, other), "messages"), orderBy("createdAt", "desc"), limit(PAGE)),
      { includeMetadataChanges: true }, // so a message flips from sending to sent the moment the server confirms it
      (snap) => {
        for (const d of snap.docs) cache.current.set(d.id, { raw: toRawMessage(d), snap: d });
        if (!fetchedOlder.current) exhausted.current = snap.size < PAGE;
        publish();
      },
      () => setState({ raw: [], hasMore: false, loading: false, error: "Could not load this conversation." }),
    );
  }, [me, other, publish]);

  // More were asked for than are loaded: read the next older messages once.
  useEffect(() => {
    if (state.loading || fetching.current || exhausted.current) return;
    const have = cache.current.size;
    if (have >= count) return;
    let oldest: MessageSnap | null = null;
    let oldestAt = Infinity;
    for (const e of cache.current.values()) if (e.raw.at < oldestAt) { oldestAt = e.raw.at; oldest = e.snap; }
    if (!oldest) return;
    const want = count - have;
    const gen = generation.current;
    fetching.current = true; fetchedOlder.current = true;
    getDocs(query(collection(db, "conversations", pairId(me, other), "messages"), orderBy("createdAt", "desc"), startAfter(oldest), limit(want))).then(
      (snap) => {
        if (gen !== generation.current) return;
        fetching.current = false;
        for (const d of snap.docs) if (!cache.current.has(d.id)) cache.current.set(d.id, { raw: toRawMessage(d), snap: d });
        if (snap.size < want) exhausted.current = true;
        publish();
      },
      () => {
        if (gen !== generation.current) return;
        fetching.current = false;
        exhausted.current = true; // stop retrying; the error shows until the chat is reopened
        publish("Could not load earlier messages.");
      },
    );
  }, [count, state.raw, state.loading, me, other, publish]);

  useEffect(() => {
    let live = true;
    Promise.all(state.raw.map((m) => open(other, m, unlocked))).then((list) => live && setOpened(list));
    return () => { live = false; };
  }, [state.raw, other, unlocked]);
  const messages = useMemo(() => {
    const list = opened ?? [];
    return since > 0 ? list.filter((m) => m.at > since) : list;
  }, [opened, since]);
  return { messages, hasMore: state.hasMore, loading: state.loading || opened === null, error: state.error };
}

/** What to send: some text, a picture, a GIF link, or text with either. */
export type Outgoing = { text?: string; image?: string; gif?: string; reply?: ReplyRef; fwd?: boolean };

/**
 * Encrypts the message and adds it, and updates the conversation's (encrypted) preview, in one step. Throws when there is nothing
 * to send, it is too big, the other person has no encryption key yet, or your own keys are locked.
 */
export async function sendMessage(me: string, other: string, out: Outgoing, first?: { friend: boolean }) {
  const body = (out.text ?? "").trim();
  const image = out.image ?? "";
  const gif = out.gif ?? "";
  if (!body && !image && !gif) throw new Error("Message is empty");
  if (body.length > MESSAGE_MAX) throw new Error(`Message is longer than ${MESSAGE_MAX} characters`);
  if (image && (!image.startsWith("data:image/") || image.length > IMAGE_MAX_CHARS)) throw new Error("That picture is too large to send");
  if (gif && !isGifUrl(gif)) throw new Error("That GIF link is not supported");
  takeTurn("message");
  const preview = body || (image ? "📷 Photo" : "GIF");
  const content: Payload = { text: body, ...(image ? { image } : {}), ...(gif ? { gif } : {}), ...(out.reply ? { reply: tidyReply(out.reply) } : {}), ...(out.fwd ? { fwd: true } : {}) };
  const [enc, lastEnc] = await sealFor(other, [content, { text: preview.slice(0, PREVIEW_MAX) }]);
  const [a, b] = me < other ? [me, other] : [other, me];
  const convo = doc(db, "conversations", pairId(me, other));
  const batch = writeBatch(db);
  const head: Record<string, unknown> = {
    members: [a, b], lastText: "", lastEnc, lastFrom: me, updatedAt: serverTimestamp(), seen: { [me]: serverTimestamp() },
  };
  // `first` is set when there is no conversation yet: the sender is recorded, and a chat with a non-friend becomes a message request.
  if (first) { head.startedBy = me; if (first.friend) head.accepted = true; }
  batch.set(convo, head, { merge: true });
  batch.set(doc(collection(convo, "messages")), { from: me, enc, createdAt: serverTimestamp() });
  await batch.commit();
}

/** Why a message could not be sent, in words for the person. */
export function failureReason(err: unknown): string {
  const code = (err as { code?: string }).code;
  if (code === "permission-denied") return "You can't message this person right now. If they are not your friend, they need to accept your message request first.";
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
export type ChatSettings = { emoji: string; nick: Record<string, string>; /** false until the first answer: the nicknames are not known yet */ loaded: boolean };
const NO_SETTINGS: ChatSettings = { emoji: DEFAULT_EMOJI, nick: {}, loaded: false };
const settingsRef = (me: string, other: string) => doc(db, "conversations", pairId(me, other), "settings", "shared");

// The last answer for each conversation stays here after its listener stops, so a list that comes back (changing tabs) shows the
// nicknames at once instead of the real names first.
const lastKnown = new Map<string, ChatSettings>();
// One listener per conversation, shared by everything on screen that needs it (the chat, and each row of the inbox).
const watched = new Map<string, { value: ChatSettings; subs: Set<() => void>; stop: () => void }>();
function watch(me: string, other: string, cb: () => void) {
  const id = pairId(me, other);
  let w = watched.get(id);
  if (!w) {
    const entry: { value: ChatSettings; subs: Set<() => void>; stop: () => void } = { value: lastKnown.get(id) ?? NO_SETTINGS, subs: new Set(), stop: () => undefined };
    entry.stop = onSnapshot(settingsRef(me, other), (snap) => {
      const d = snap.data() ?? {};
      const nick: Record<string, string> = {};
      for (const [k, v] of Object.entries((d.nick ?? {}) as Record<string, unknown>)) if (typeof v === "string" && v) nick[k] = v;
      entry.value = { emoji: typeof d.emoji === "string" && d.emoji ? d.emoji : DEFAULT_EMOJI, nick, loaded: true };
      lastKnown.set(id, entry.value);
      entry.subs.forEach((f) => f());
    }, () => { entry.value = { ...entry.value, loaded: true }; entry.subs.forEach((f) => f()); }); // no access (rules not deployed): real names
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
  const snapshot = useCallback(() => watched.get(pairId(me, other))?.value ?? lastKnown.get(pairId(me, other)) ?? NO_SETTINGS, [me, other]);
  return useSyncExternalStore(subscribe, snapshot);
}

export const setChatEmoji = (me: string, other: string, emoji: string) =>
  setDoc(settingsRef(me, other), { emoji }, { merge: true });
/** Gives `who` (you or the other person) a nickname in this conversation; an empty one takes it away. */
export const setNickname = (me: string, other: string, who: string, nickname: string) =>
  setDoc(settingsRef(me, other), { nick: { [who]: nickname.trim().slice(0, NICK_MAX) } }, { merge: true });

/** What to call someone in this conversation: their nickname here, otherwise their name. "…" until the nicknames are known, so the name never flashes first. */
export const calledBy = (s: ChatSettings, uid: string, name: string) => (s.loaded ? s.nick[uid] || name : "…");

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
/** Restricts someone (Messenger's "Restrict"): they can still message you and are not told, but the chat moves to your message requests. */
export const restrictPerson = (me: string, other: string) =>
  setDoc(doc(db, "users", me, "restricted", other), { createdAt: serverTimestamp() });
export const unrestrictPerson = (me: string, other: string) => deleteDoc(doc(db, "users", me, "restricted", other));

/** Says yes to a message request: the chat opens for both of you. */
export const acceptChat = (me: string, other: string) =>
  updateDoc(doc(db, "conversations", pairId(me, other)), { accepted: true });

// ---------- reply, react, forward, pin, edit, unsend, report ----------

const REPLY_SNIPPET = 120;
const PIN_SNIPPET = 200;
export const PIN_MAX = 10;
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const tidyReply = (r: ReplyRef): ReplyRef => ({
  id: r.id, from: r.from, text: r.text.slice(0, REPLY_SNIPPET), ...(r.image ? { image: true } : {}), ...(r.gif ? { gif: true } : {}),
});
/** What a reply to this message carries: who wrote it and a short copy of what it said. */
export const replyRefOf = (m: Message): ReplyRef => tidyReply({ id: m.id, from: m.from, text: m.text, image: !!m.image, gif: !!m.gif });
/** How a message reads in a one-line summary (a reply's quote, a pin, a forward). */
export const snippetOf = (m: { text: string; image?: boolean | string; gif?: boolean | string }) => m.text || (m.image ? "📷 Photo" : m.gif ? "GIF" : "");

const messageRef = (me: string, other: string, id: string) => doc(db, "conversations", pairId(me, other), "messages", id);
const reactionRef = (me: string, other: string, id: string, by: string) => doc(db, "conversations", pairId(me, other), "reactions", `${id}_${by}`);
const pinRef = (me: string, other: string, id: string) => doc(db, "conversations", pairId(me, other), "pins", id);

export type Reaction = { by: string; emoji: string };
export type Pin = { id: string; by: string; /** who wrote the pinned message */ from: string; text: string; /** when it was sent */ at: number; pinnedAt: number };

/** Live reactions (by message) and pins of one conversation, decrypted. Both stay empty if the rules are not deployed yet. */
export function useChatExtras(me: string, other: string) {
  const [rawReactions, setRawReactions] = useState<{ mid: string; by: string; enc: string }[]>([]);
  const [rawPins, setRawPins] = useState<{ id: string; by: string; enc: string; pinnedAt: number }[]>([]);
  const [reactions, setReactions] = useState<Map<string, Reaction[]>>(new Map());
  const [pins, setPins] = useState<Pin[]>([]);
  const keys = useE2ee().phase;
  useEffect(() => {
    const pid = pairId(me, other);
    const none = () => undefined;
    const a = onSnapshot(query(collection(db, "conversations", pid, "reactions"), limit(1000)),
      (snap) => setRawReactions(snap.docs.map((d) => ({ mid: d.data().mid as string, by: d.data().by as string, enc: d.data().enc as string }))), none);
    const b = onSnapshot(collection(db, "conversations", pid, "pins"),
      (snap) => setRawPins(snap.docs.map((d) => ({ id: d.id, by: d.data(estimate).by as string, enc: d.data().enc as string, pinnedAt: millis(d.data(estimate).at) }))), none);
    return () => { a(); b(); };
  }, [me, other]);
  useEffect(() => {
    let live = true;
    Promise.all(rawReactions.map(async (r) => {
      try { const p = await openFrom(other, r.enc); return p.text ? { mid: r.mid, by: r.by, emoji: p.text } : null; } catch { return null; }
    })).then((list) => {
      if (!live) return;
      const by = new Map<string, Reaction[]>();
      for (const r of list) if (r) by.set(r.mid, [...(by.get(r.mid) ?? []), { by: r.by, emoji: r.emoji }]);
      setReactions(by);
    });
    return () => { live = false; };
  }, [rawReactions, other, keys]);
  useEffect(() => {
    let live = true;
    Promise.all(rawPins.map(async (r) => {
      try { const p = await openFrom(other, r.enc); return { id: r.id, by: r.by, from: p.from ?? "", text: p.text ?? "", at: p.at ?? 0, pinnedAt: r.pinnedAt }; } catch { return null; }
    })).then((list) => live && setPins(list.filter((x): x is Pin => !!x).sort((x, y) => y.pinnedAt - x.pinnedAt)));
    return () => { live = false; };
  }, [rawPins, other, keys]);
  return { reactions, pins };
}

/** Sets your reaction to a message (one per person, a new one replaces the old), or takes it away with null. */
export async function setReaction(me: string, other: string, id: string, emoji: string | null) {
  takeTurn("react");
  if (emoji === null) return deleteDoc(reactionRef(me, other, id, me));
  const [enc] = await sealFor(other, [{ text: emoji }]);
  return setDoc(reactionRef(me, other, id, me), { mid: id, by: me, enc, at: serverTimestamp() });
}

/** Pins a message for both of you. The pin keeps a short encrypted copy so the list works without loading the whole chat. */
export async function pinMessage(me: string, other: string, m: Message) {
  const [enc] = await sealFor(other, [{ text: snippetOf({ text: m.text, image: m.image, gif: m.gif }).slice(0, PIN_SNIPPET), from: m.from, at: m.at }]);
  return setDoc(pinRef(me, other, m.id), { by: me, at: serverTimestamp(), enc });
}
export const unpinMessage = (me: string, other: string, id: string) => deleteDoc(pinRef(me, other, id));

/**
 * Changes the text of one of your messages (a photo, GIF, reply and "forwarded" mark stay). `latest` says it is the newest message
 * of the chat, so the inbox preview changes with it. Pins keep the words they were made with.
 */
export async function editMessage(me: string, other: string, m: Message, text: string, latest: boolean) {
  const body = text.trim();
  if (!body && !m.image && !m.gif) throw new Error("Message is empty");
  if (body.length > MESSAGE_MAX) throw new Error(`Message is longer than ${MESSAGE_MAX} characters`);
  takeTurn("message");
  const content: Payload = { text: body, ...(m.image ? { image: m.image } : {}), ...(m.gif ? { gif: m.gif } : {}), ...(m.reply ? { reply: m.reply } : {}), ...(m.fwd ? { fwd: true } : {}) };
  const [enc, lastEnc] = await sealFor(other, [content, { text: (body || snippetOf({ text: "", image: m.image, gif: m.gif })).slice(0, PREVIEW_MAX) }]);
  const batch = writeBatch(db);
  // text, image and gif only exist on messages from before encryption: an edit clears them so the old words do not stay behind
  batch.update(messageRef(me, other, m.id), { enc, editedAt: serverTimestamp(), text: deleteField(), image: deleteField(), gif: deleteField() });
  if (latest) batch.update(doc(db, "conversations", pairId(me, other)), { lastEnc });
  await batch.commit();
}

/**
 * Takes back one of your messages for both of you. What is left is a note that it was unsent; its text, picture, GIF, pin and your
 * reaction are removed. `latest` says it is the newest message of the chat, so the inbox preview stops showing it.
 */
export async function unsendMessage(me: string, other: string, m: Message, latest: boolean) {
  const batch = writeBatch(db);
  // text, image and gif only exist on messages from before encryption: they are removed too
  batch.update(messageRef(me, other, m.id), { enc: "", unsent: true, text: deleteField(), image: deleteField(), gif: deleteField() });
  batch.delete(pinRef(me, other, m.id));
  batch.delete(reactionRef(me, other, m.id, me));
  if (latest) {
    const [lastEnc] = await sealFor(other, [{ text: "🚫 Message unsent" }]);
    batch.update(doc(db, "conversations", pairId(me, other)), { lastEnc });
  }
  await batch.commit();
}

/** Sends a copy of a message to other chats. Each person is tried separately, so one who cannot receive it does not stop the rest. */
export async function forwardMessage(me: string, m: Message, to: { uid: string; first?: { friend: boolean } }[]) {
  const out: Outgoing = { text: m.text, image: m.image, gif: m.gif, fwd: true };
  const sent: string[] = [];
  const failed: { uid: string; reason: string }[] = [];
  for (const t of to) {
    try { await sendMessage(me, t.uid, out, t.first); sent.push(t.uid); }
    catch (err) { failed.push({ uid: t.uid, reason: failureReason(err) }); }
  }
  return { sent, failed };
}

export const REPORT_REASONS = ["Spam", "Harassment or bullying", "Inappropriate content", "Scam or fraud", "Something else"] as const;
/**
 * Reports a message to the people who run VibeBook. Messages are end-to-end encrypted, so nobody else can read them: the report
 * holds only what you choose to send (the words of the message and whether it had a photo or GIF), never the encrypted data.
 */
export async function reportMessage(me: string, other: string, m: Message, reason: string, details: string) {
  takeTurn("report");
  await addDoc(collection(db, "messageReports"), {
    reporter: me, reported: other, conversation: pairId(me, other), messageId: m.id, reason,
    excerpt: m.text.slice(0, 500), image: !!m.image, gif: !!m.gif, details: details.trim().slice(0, 300), createdAt: serverTimestamp(),
  });
}
