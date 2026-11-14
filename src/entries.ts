import { logActivity } from "./activity";
import {
  collection, doc, getDocs, orderBy, query, serverTimestamp, writeBatch,
  type DocumentReference, type Timestamp,
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
  /** https link to a YouTube or Vimeo video, or a direct .mp4/.webm file. "" when none. */
  videoUrl: string;
};

export type Entry = Omit<EntryInput, "visibility" | "videoUrl"> & {
  /** Entries written before video links existed have none. */
  videoUrl?: string;
  id: string;
  /** Entries written before visibility existed have none, and count as private. */
  visibility?: Visibility;
  /** Entries written before groups existed have none. */
  groupIds?: string[];
  /** Whose logbook the entry lives in. Set when loading; not stored. */
  ownerUid?: string;
  /** Set when this card is someone's repost of the entry: who reposted it, and when. Not stored on the entry. */
  repostedBy?: string;
  repostDate?: string;
  repostTime?: string;
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
  logActivity(uid, `Added the entry “${input.title}”`);
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
  const extras = (await Promise.all(removeIds.map((id) => photoExtras(doc(collection(entryRef, "photos"), id))))).flat();
  const batch = writeBatch(db);
  extras.forEach((r) => batch.delete(r));
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
  logActivity(uid, `Edited the entry “${input.title}”`);
}

/** Every comment and reaction on one photo, so they can be deleted along with it. */
async function photoExtras(photoRef: DocumentReference) {
  const [comments, reactions] = await Promise.all([
    getDocs(collection(photoRef, "comments")),
    getDocs(collection(photoRef, "reactions")),
  ]);
  return [...comments.docs, ...reactions.docs].map((d) => d.ref);
}

export async function deleteEntry(uid: string, entry: Entry): Promise<void> {
  const entryRef = doc(entriesRef(uid), entry.id);
  const [photos, comments, reactions] = await Promise.all([
    getDocs(collection(entryRef, "photos")),
    getDocs(collection(entryRef, "comments")),
    getDocs(collection(entryRef, "reactions")),
  ]);
  const extras = (await Promise.all(photos.docs.map((p) => photoExtras(p.ref)))).flat();
  const batch = writeBatch(db);
  extras.forEach((r) => batch.delete(r));
  photos.forEach((p) => batch.delete(p.ref));
  comments.forEach((c) => batch.delete(c.ref));
  reactions.forEach((r) => batch.delete(r.ref));
  (entry.groupIds ?? []).forEach((gid) => batch.delete(groupPostRef(gid, uid, entry.id)));
  batch.delete(entryRef);
  await batch.commit();
  logActivity(uid, `Deleted the entry “${entry.title}”`);
}

/** Sort and day-heading key: a repost sits where it was reposted, not where the original was written. */
export const stampOf = (e: Pick<Entry, "date" | "time" | "repostDate" | "repostTime">) =>
  `${e.repostDate ?? e.date} ${e.repostTime ?? e.time}`;
export const newestFirst = (a: Entry, b: Entry) => (stampOf(a) < stampOf(b) ? 1 : -1);

/** Changes which groups an existing entry is shared to, without touching anything else. */
export async function setEntryGroups(uid: string, entry: Entry, groupIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(entriesRef(uid), entry.id), { groupIds });
  groupIds.forEach((gid) => batch.set(groupPostRef(gid, uid, entry.id), { ownerUid: uid, entryId: entry.id, date: entry.date, time: entry.time }));
  (entry.groupIds ?? []).filter((gid) => !groupIds.includes(gid))
    .forEach((gid) => batch.delete(groupPostRef(gid, uid, entry.id)));
  await batch.commit();
}

export { entriesRef };
