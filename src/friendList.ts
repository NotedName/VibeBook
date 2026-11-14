import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Friends you can see on someone else's profile. Real friendships are readable only by the two friends, so each person
 * keeps a pointer list at users/{uid}/friendList/{friendUid} in step with their own friendships (syncFriendList), and
 * firestore.rules lets other people read it only while the owner's "friendsVisible" setting is on.
 */
export async function syncFriendList(uid: string, friends: Set<string>): Promise<void> {
  const col = collection(db, "users", uid, "friendList");
  const have = new Set((await getDocs(col)).docs.map((d) => d.id));
  const add = [...friends].filter((f) => !have.has(f));
  const drop = [...have].filter((f) => !friends.has(f));
  for (let i = 0; i < add.length; i += 200) {
    const batch = writeBatch(db);
    add.slice(i, i + 200).forEach((f) => batch.set(doc(col, f), { createdAt: serverTimestamp() }));
    await batch.commit();
  }
  await Promise.all(drop.map((f) => deleteDoc(doc(col, f))));
}

/** Someone's friends as they have chosen to show them. `error` is set when the list is hidden from you (or cannot be loaded). */
export function useFriendsOf(uid: string, enabled: boolean): { uids: string[] | null; error: boolean } {
  const [uids, setUids] = useState<string[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    setUids(null); setError(false);
    return onSnapshot(
      collection(db, "users", uid, "friendList"),
      (snap) => setUids(snap.docs.map((d) => d.id)),
      () => setError(true),
    );
  }, [uid, enabled]);
  return { uids, error };
}

/**
 * The friends you and another person have in common, read from the friend list they chose to show.
 * `mutual` is null while loading or when their list is private (nothing can be said then).
 */
export function useMutualFriends(uid: string, myFriends: Set<string>, enabled: boolean): { mutual: string[] | null; theirs: string[] | null } {
  const { uids, error } = useFriendsOf(uid, enabled);
  const mutual = enabled && !error && uids ? uids.filter((id) => myFriends.has(id)) : null;
  return { mutual, theirs: enabled && !error ? uids : null };
}
