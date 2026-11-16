import { collection, deleteDoc, doc, getDocs, query, where, writeBatch, type CollectionReference } from "firebase/firestore";
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential, type User } from "firebase/auth";
import { db } from "./firebase";
import { deleteEntry, entriesRef, type Entry } from "./entries";

/** Everything under users/{uid} that firestore.rules lets you delete. The activity log is append-only, so it stays (only you could ever read it). */
const OWN_COLLECTIONS = [
  "reposts", "teasers", "likes", "friendList", "reach", "notifications", "hours",
  "following", "unfollowed", "chatPrefs", "blocked", "restricted", "keyBackup",
];

async function deleteAll(ref: CollectionReference | ReturnType<typeof query>): Promise<void> {
  const snap = await getDocs(ref);
  // A batch holds at most 500 writes.
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/**
 * Settings > Reset > Delete account. Asks for the password first (so a wrong one changes nothing), then removes your entries with their
 * photos, comments and reactions, your own lists and settings, friendships and requests, your username and profile, and finally the
 * sign-in itself. Chats, group memberships and posts, and your public encryption key are not removed: they need a server to clean up.
 * If it stops half way, nothing is lost that cannot be retried: run it again.
 */
export async function deleteAccount(user: User, password: string): Promise<void> {
  if (!user.email) throw new Error("This account has no email address.");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  const uid = user.uid;

  const entries = await getDocs(entriesRef(uid));
  for (const d of entries.docs) await deleteEntry(uid, { id: d.id, ...d.data() } as Entry);

  for (const name of OWN_COLLECTIONS) await deleteAll(collection(db, "users", uid, name));
  await deleteAll(query(collection(db, "friendships"), where("members", "array-contains", uid)));
  await deleteAll(query(collection(db, "friendRequests"), where("from", "==", uid)));
  await deleteAll(query(collection(db, "friendRequests"), where("to", "==", uid)));
  await deleteAll(query(collection(db, "usernames"), where("uid", "==", uid)));
  await deleteDoc(doc(db, "presence", uid)).catch(() => {});
  await deleteDoc(doc(db, "profiles", uid));

  await deleteUser(user);
}
