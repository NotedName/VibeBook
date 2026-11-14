import { useEffect, useMemo, useState } from "react";
import {
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch,
  type DocumentData, type QueryDocumentSnapshot, type SnapshotOptions, type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { pairId } from "./social";

/**
 * Direct messages between two friends. One conversation per pair, named like their friendship ("<uidA>_<uidB>", sorted):
 *   conversations/{pairId}            members, lastText, lastFrom, updatedAt, seen { <uid>: when that person last read }
 *   conversations/{pairId}/messages/* from, text, createdAt
 * firestore.rules only lets friends write, and only the two people in a conversation can read it.
 */
export const MESSAGE_MAX = 2000;
const PREVIEW_MAX = 120;
export const PAGE = 50;

export type Message = { id: string; from: string; text: string; at: number };
export type Conversation = { id: string; other: string; lastText: string; lastFrom: string; updatedAt: number; seenAt: number };
export type Chats = { ready: boolean; error: string; list: Conversation[]; unread: number };

const estimate: SnapshotOptions = { serverTimestamps: "estimate" };
const millis = (v: unknown) => (v as Timestamp | undefined)?.toMillis() ?? 0;

export const isUnread = (c: Conversation, uid: string) => c.lastFrom !== uid && c.updatedAt > c.seenAt;

function toConversation(uid: string, d: QueryDocumentSnapshot<DocumentData>): Conversation {
  const data = d.data(estimate);
  return {
    id: d.id,
    other: (data.members as string[]).find((m) => m !== uid)!,
    lastText: data.lastText as string,
    lastFrom: data.lastFrom as string,
    updatedAt: millis(data.updatedAt),
    seenAt: millis((data.seen as Record<string, unknown> | undefined)?.[uid]),
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
    (snap) => setState({
      messages: snap.docs.map((d) => {
        const data = d.data(estimate);
        return { id: d.id, from: data.from as string, text: data.text as string, at: millis(data.createdAt) };
      }).reverse(),
      hasMore: snap.size >= count,
      loading: false,
      error: "",
    }),
    () => setState({ messages: [], hasMore: false, loading: false, error: "Could not load this conversation." }),
  ), [me, other, count]);
  return state;
}

/** Adds the message and updates the conversation's preview in one step. Throws when the text is empty or too long. */
export async function sendMessage(me: string, other: string, text: string) {
  const body = text.trim();
  if (!body) throw new Error("Message is empty");
  if (body.length > MESSAGE_MAX) throw new Error(`Message is longer than ${MESSAGE_MAX} characters`);
  const [a, b] = me < other ? [me, other] : [other, me];
  const convo = doc(db, "conversations", pairId(me, other));
  const batch = writeBatch(db);
  batch.set(convo, {
    members: [a, b], lastText: body.slice(0, PREVIEW_MAX), lastFrom: me, updatedAt: serverTimestamp(), seen: { [me]: serverTimestamp() },
  }, { merge: true });
  batch.set(doc(collection(convo, "messages")), { from: me, text: body, createdAt: serverTimestamp() });
  await batch.commit();
}

/** Records that you have read everything in this conversation up to now. The conversation must already exist. */
export const markConversationSeen = (me: string, other: string) =>
  updateDoc(doc(db, "conversations", pairId(me, other)), { [`seen.${me}`]: serverTimestamp() });
