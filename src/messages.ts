import { useEffect, useMemo, useState } from "react";
import {
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch,
  type DocumentData, type QueryDocumentSnapshot, type SnapshotOptions, type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { pairId } from "./social";
import { isGifUrl } from "./stickers";

/**
 * Direct messages between two friends. One conversation per pair, named like their friendship ("<uidA>_<uidB>", sorted):
 *   conversations/{pairId}            members, lastText, lastFrom, updatedAt, seen { <uid>: when that person last read }
 *   conversations/{pairId}/messages/* from, text, createdAt, and optionally image (a small JPEG data URL) or gif (a Giphy/Tenor link)
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
export type Conversation = { id: string; other: string; lastText: string; lastFrom: string; updatedAt: number; seenAt: number; otherSeenAt: number };
export type Chats = { ready: boolean; error: string; list: Conversation[]; unread: number };

const estimate: SnapshotOptions = { serverTimestamps: "estimate" };
const millis = (v: unknown) => (v as Timestamp | undefined)?.toMillis() ?? 0;

export const isUnread = (c: Conversation, uid: string) => c.lastFrom !== uid && c.updatedAt > c.seenAt;

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
  };
}

/** Live conversations of the signed-in person, newest first. Subscribed once per session (Shell). */
export function useConversations(uid: string): Chats {
  const [list, setList] = useState<Conversation[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => onSnapshot(
    query(collection(db, "conversations"), where("members", "array-contains", uid), orderBy("updatedAt", "desc")),
    (snap) => { setList(snap.docs.map((d) => toConversation(uid, d))); setError(""); setReady(true); },
    () => { setError("Could not load messages. If you just updated the app, deploy the Firestore rules and indexes first (npm run deploy)."); setReady(true); },
  ), [uid]);
  const unread = useMemo(() => list.filter((c) => isUnread(c, uid)).length, [list, uid]);
  return { ready, error, list, unread };
}

/** The newest `count` messages of one conversation, oldest first, and whether there are older ones. */
export function useMessages(me: string, other: string, count: number) {
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
  return state;
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
  if (code === "permission-denied") return "You can only message friends.";
  if (code === "unavailable") return "There is no connection.";
  if (err instanceof Error && !code) return err.message;
  return "Something went wrong.";
}

/** Records that you have read everything in this conversation up to now. The conversation must already exist. */
export const markConversationSeen = (me: string, other: string) =>
  updateDoc(doc(db, "conversations", pairId(me, other)), { [`seen.${me}`]: serverTimestamp() });
