import { useEffect, useMemo, useState } from "react";
import {
  collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type { FriendRequest, Relation } from "./types";

const pairId = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);

export const sendRequest = (me: string, them: string) =>
  setDoc(doc(db, "friendRequests", `${me}_${them}`), { from: me, to: them, createdAt: serverTimestamp() });

export const declineRequest = (me: string, from: string) => deleteDoc(doc(db, "friendRequests", `${from}_${me}`));
export const cancelRequest = (me: string, to: string) => deleteDoc(doc(db, "friendRequests", `${me}_${to}`));
export const unfriend = (me: string, other: string) => deleteDoc(doc(db, "friendships", pairId(me, other)));
export const follow = (me: string, target: string) =>
  setDoc(doc(db, "users", me, "following", target), { createdAt: serverTimestamp() });
export const unfollow = (me: string, target: string) => deleteDoc(doc(db, "users", me, "following", target));

/** Accepting creates the friendship and removes the request in one step. */
export async function acceptRequest(me: string, from: string, alsoDeleteOutgoing: boolean) {
  const batch = writeBatch(db);
  const [a, b] = me < from ? [me, from] : [from, me];
  batch.set(doc(db, "friendships", pairId(me, from)), { members: [a, b], createdAt: serverTimestamp() });
  batch.delete(doc(db, "friendRequests", `${from}_${me}`));
  if (alsoDeleteOutgoing) batch.delete(doc(db, "friendRequests", `${me}_${from}`));
  await batch.commit();
}

export type SocialState = {
  ready: boolean;
  error: string;
  friends: Set<string>;
  following: Set<string>;
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  relationOf: (uid: string) => Relation;
};

/** Live friend, request and follow data for the signed-in user. Subscribed once per session. */
export function useSocial(uid: string): SocialState {
  const [friends, setFriends] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fail = () => { setError("Could not load friends. Check your connection."); setReady(true); };
    const toReq = (d: { id: string; data: () => Record<string, unknown> }) =>
      ({ id: d.id, from: d.data().from as string, to: d.data().to as string });
    const unsubs = [
      onSnapshot(query(collection(db, "friendships"), where("members", "array-contains", uid)), (snap) => {
        setFriends(new Set(snap.docs.map((d) => (d.data().members as string[]).find((m) => m !== uid)!).filter(Boolean)));
        setReady(true);
      }, fail),
      onSnapshot(query(collection(db, "friendRequests"), where("to", "==", uid)),
        (snap) => setIncoming(snap.docs.map(toReq)), fail),
      onSnapshot(query(collection(db, "friendRequests"), where("from", "==", uid)),
        (snap) => setOutgoing(snap.docs.map(toReq)), fail),
      onSnapshot(collection(db, "users", uid, "following"),
        (snap) => setFollowing(new Set(snap.docs.map((d) => d.id))), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  const relationOf = useMemo(() => (other: string): Relation => {
    if (other === uid) return "self";
    if (friends.has(other)) return "friends";
    if (incoming.some((r) => r.from === other)) return "incoming";
    if (outgoing.some((r) => r.to === other)) return "outgoing";
    return "none";
  }, [uid, friends, incoming, outgoing]);

  return { ready, error, friends, following, incoming, outgoing, relationOf };
}
