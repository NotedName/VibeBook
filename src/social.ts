import { logActivity } from "./activity";
import { useEffect, useMemo, useState } from "react";
import {
  collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type { FriendRequest, Relation } from "./types";
import { dropNote, pushNote } from "./notifications";
import { takeTurn } from "./rateLimit";

export const pairId = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);

export const sendRequest = (me: string, them: string) => {
  try { takeTurn("request"); } catch (err) { return Promise.reject(err); }
  return setDoc(doc(db, "friendRequests", `${me}_${them}`), { from: me, to: them, createdAt: serverTimestamp() })
    .then(() => { logActivity(me, "Sent a friend request to", { who: them }); return pushNote(them, me, "friend_request", "friend_request"); });
};

export const declineRequest = (me: string, from: string) =>
  deleteDoc(doc(db, "friendRequests", `${from}_${me}`)).then(() => { logActivity(me, "Declined a friend request from", { who: from }); return dropNote(me, from, "friend_request"); });
export const cancelRequest = (me: string, to: string) =>
  deleteDoc(doc(db, "friendRequests", `${me}_${to}`)).then(() => { logActivity(me, "Cancelled your friend request to", { who: to }); return dropNote(to, me, "friend_request"); });
export const unfriend = (me: string, other: string) =>
  deleteDoc(doc(db, "friendships", pairId(me, other))).then(() => logActivity(me, "Unfriended", { who: other }));
/**
 * Following works like Facebook: you see what a person shares in your Feed's Following tab, and they get a notification when you
 * start. It gives you no access to anything they keep private. Friends are followed automatically; unfollowing a friend keeps
 * the friendship but takes them out of your Following feed (users/{me}/unfollowed/{friend}). Following someone who is not a
 * friend is users/{me}/following/{them}.
 */
export const follow = (me: string, target: string, isFriend = false) => {
  const gone = doc(db, "users", me, "unfollowed", target);
  if (isFriend) return deleteDoc(gone).then(() => logActivity(me, "Started following", { who: target }));
  const batch = writeBatch(db);
  batch.set(doc(db, "users", me, "following", target), { createdAt: serverTimestamp() });
  batch.delete(gone);
  return batch.commit().then(() => { logActivity(me, "Started following", { who: target }); return pushNote(target, me, "follow", "follow"); });
};
export const unfollow = (me: string, target: string, isFriend = false) => {
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", me, "following", target));
  if (isFriend) batch.set(doc(db, "users", me, "unfollowed", target), { createdAt: serverTimestamp() });
  return batch.commit().then(() => { logActivity(me, "Stopped following", { who: target }); return dropNote(target, me, "follow"); });
};

/** Accepting creates the friendship and removes the request in one step. */
export async function acceptRequest(me: string, from: string, alsoDeleteOutgoing: boolean) {
  const batch = writeBatch(db);
  const [a, b] = me < from ? [me, from] : [from, me];
  batch.set(doc(db, "friendships", pairId(me, from)), { members: [a, b], createdAt: serverTimestamp() });
  batch.delete(doc(db, "friendRequests", `${from}_${me}`));
  if (alsoDeleteOutgoing) batch.delete(doc(db, "friendRequests", `${me}_${from}`));
  await batch.commit();
  // The friendship is made once the batch commits. The activity entry and the two notifications are extras: they run in the
  // background so a slow or refused notification can never turn a successful accept into an error message.
  try { logActivity(me, "Became friends with", { who: from }); } catch { /* the friendship stands */ }
  void Promise.allSettled([dropNote(me, from, "friend_request"), pushNote(from, me, "friend_accept", "friend_accept")]);
}

export type SocialState = {
  ready: boolean;
  error: string;
  friends: Set<string>;
  /** people you follow: the ones you chose to follow, plus every friend you have not unfollowed */
  following: Set<string>;
  /** friends you unfollowed (still friends, but not in your Following feed) */
  unfollowed: Set<string>;
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  relationOf: (uid: string) => Relation;
};

/** Live friend, request and follow data for the signed-in user. Subscribed once per session. */
export function useSocial(uid: string): SocialState {
  const [friends, setFriends] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [unfollowed, setUnfollowed] = useState<Set<string>>(new Set());
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
        (snap) => setChosen(new Set(snap.docs.map((d) => d.id))), fail),
      onSnapshot(collection(db, "users", uid, "unfollowed"),
        (snap) => setUnfollowed(new Set(snap.docs.map((d) => d.id))), () => undefined), // empty until the rules are deployed
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  const following = useMemo(() => {
    const all = new Set(chosen);
    friends.forEach((f) => { if (!unfollowed.has(f)) all.add(f); });
    unfollowed.forEach((f) => all.delete(f));
    return all;
  }, [chosen, friends, unfollowed]);

  const relationOf = useMemo(() => (other: string): Relation => {
    if (other === uid) return "self";
    if (friends.has(other)) return "friends";
    if (incoming.some((r) => r.from === other)) return "incoming";
    if (outgoing.some((r) => r.to === other)) return "outgoing";
    return "none";
  }, [uid, friends, incoming, outgoing]);

  return { ready, error, friends, following, unfollowed, incoming, outgoing, relationOf };
}
