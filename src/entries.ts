import {
  collection, doc, getDocs, orderBy, query, serverTimestamp, writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { compressImage } from "./image";
import { groupPostRef } from "./groups";
import type { Visibility } from "./types";

export const MAX_PHOTOS = 8;

export type EntryInput = {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  title: string;
  skills: string[];
  description: string;
  visibility: Visibility;
  /** Groups whose members can see and comment on this entry. */
  groupIds: string[];
};

export type Entry = Omit<EntryInput, "visibility"> & {
  id: string;
  /** Entries written before visibility existed have none, and count as private. */
  visibility?: Visibility;
  /** Entries written before groups existed have none. */
  groupIds?: string[];
  /** Whose logbook the entry lives in. Set when loading; not stored. */
  ownerUid?: string;
  photoCount: number;
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export type Photo = { id: string; data: string; order: number };

const entriesRef = (uid: string) => collection(db, "users", uid, "entries");

/** The small index document that lists an entry in a group's feed. */
const groupPost = (uid: string, entryId: string, input: EntryInput) => ({
  ownerUid: uid, entryId, date: input.date, time: input.time,
});

export async function addEntry(uid: string, input: EntryInput, files: File[]): Promise<void> {
  if (files.length > MAX_PHOTOS) throw new Error(`Maximum ${MAX_PHOTOS} photos per entry`);
  const photos = await Promise.all(files.map(compressImage));

  const entryRef = doc(entriesRef(uid));
  const batch = writeBatch(db);
  batch.set(entryRef, { ...input, photoCount: photos.length, createdAt: serverTimestamp() });
  photos.forEach((data, order) => batch.set(doc(collection(entryRef, "photos")), { data, order }));
  input.groupIds.forEach((gid) => batch.set(groupPostRef(gid, uid, entryRef.id), groupPost(uid, entryRef.id, input)));
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
  input.groupIds.forEach((gid) => batch.set(groupPostRef(gid, uid, entry.id), groupPost(uid, entry.id, input)));
  (entry.groupIds ?? [])
    .filter((gid) => !input.groupIds.includes(gid))
    .forEach((gid) => batch.delete(groupPostRef(gid, uid, entry.id)));
  const nextOrder = keep.reduce((max, p) => Math.max(max, p.order), -1) + 1;
  added.forEach((data, i) =>
    batch.set(doc(collection(entryRef, "photos")), { data, order: nextOrder + i }),
  );
  await batch.commit();
}

export async function deleteEntry(uid: string, entry: Entry): Promise<void> {
  const entryRef = doc(entriesRef(uid), entry.id);
  const [photos, comments] = await Promise.all([
    getDocs(collection(entryRef, "photos")),
    getDocs(collection(entryRef, "comments")),
  ]);
  const batch = writeBatch(db);
  photos.forEach((p) => batch.delete(p.ref));
  comments.forEach((c) => batch.delete(c.ref));
  (entry.groupIds ?? []).forEach((gid) => batch.delete(groupPostRef(gid, uid, entry.id)));
  batch.delete(entryRef);
  await batch.commit();
}

export { entriesRef };
