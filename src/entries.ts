import {
  collection, doc, getDocs, orderBy, query, serverTimestamp, writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { compressImage } from "./image";

export const MAX_PHOTOS = 8;

export type EntryInput = {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  title: string;
  skills: string[];
  description: string;
};

export type Entry = EntryInput & {
  id: string;
  photoCount: number;
  createdAt: Timestamp | null;
};

const entriesRef = (uid: string) => collection(db, "users", uid, "entries");

export async function addEntry(uid: string, input: EntryInput, files: File[]): Promise<void> {
  if (files.length > MAX_PHOTOS) throw new Error(`Maximum ${MAX_PHOTOS} photos per entry`);
  const photos = await Promise.all(files.map(compressImage));

  const entryRef = doc(entriesRef(uid));
  const batch = writeBatch(db);
  batch.set(entryRef, { ...input, photoCount: photos.length, createdAt: serverTimestamp() });
  photos.forEach((data, order) => batch.set(doc(collection(entryRef, "photos")), { data, order }));
  await batch.commit();
}

export async function loadPhotos(uid: string, entryId: string): Promise<string[]> {
  const snap = await getDocs(
    query(collection(db, "users", uid, "entries", entryId, "photos"), orderBy("order")),
  );
  return snap.docs.map((d) => d.data().data as string);
}

export async function deleteEntry(uid: string, entryId: string): Promise<void> {
  const entryRef = doc(entriesRef(uid), entryId);
  const photos = await getDocs(collection(entryRef, "photos"));
  const batch = writeBatch(db);
  photos.forEach((p) => batch.delete(p.ref));
  batch.delete(entryRef);
  await batch.commit();
}

export { entriesRef };
