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
  updatedAt?: Timestamp | null;
};

export type Photo = { id: string; data: string; order: number };

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

export async function loadPhotos(uid: string, entryId: string): Promise<Photo[]> {
  const snap = await getDocs(
    query(collection(db, "users", uid, "entries", entryId, "photos"), orderBy("order")),
  );
  return snap.docs.map((d) => ({ id: d.id, data: d.data().data as string, order: d.data().order as number }));
}

/** Update text fields, drop the photos listed in removeIds and append newFiles. */
export async function updateEntry(
  uid: string,
  entry: Entry,
  input: EntryInput,
  keep: Photo[],
  removeIds: string[],
  newFiles: File[],
): Promise<void> {
  if (keep.length + newFiles.length > MAX_PHOTOS) throw new Error(`Maximum ${MAX_PHOTOS} photos per entry`);
  const added = await Promise.all(newFiles.map(compressImage));

  const entryRef = doc(entriesRef(uid), entry.id);
  const batch = writeBatch(db);
  batch.update(entryRef, {
    ...input,
    photoCount: keep.length + added.length,
    updatedAt: serverTimestamp(),
  });
  removeIds.forEach((id) => batch.delete(doc(collection(entryRef, "photos"), id)));
  const nextOrder = keep.reduce((max, p) => Math.max(max, p.order), -1) + 1;
  added.forEach((data, i) =>
    batch.set(doc(collection(entryRef, "photos")), { data, order: nextOrder + i }),
  );
  await batch.commit();
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
