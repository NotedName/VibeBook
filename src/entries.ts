import { logActivity } from "./activity";
import {
  collection, deleteField, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, writeBatch,
  type DocumentReference, type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { compressImage } from "./image";
import { groupPostRef } from "./groups";
import { chosenVisibility, privateGroupIds, teaserOp, teaserRef, visibilityFields } from "./entryPrivacy";
import type { Visibility } from "./types";
import { spanMinutes } from "./weeks";

export const MAX_PHOTOS = 8;
/** Longest text an entry can hold. Longer descriptions show a few lines with a Show more button. */
export const TITLE_MAX = 140;
export const DESC_MAX = 2000;
export const SKILL_MAX = 40;
/** Each skill is a short phrase, not a sentence. */
export const SKILL_WORDS_MAX = 4;
export const SKILLS_MAX = 15;
/** Room in the skills box for the maximum number of skills plus their commas. */
export const SKILLS_INPUT_MAX = SKILLS_MAX * (SKILL_MAX + 2);

/** What is wrong with an entry's text, or "" when it fits the limits. */
export function entryTextProblem(i: Pick<EntryInput, "title" | "description" | "skills" | "clockIn" | "clockOut">): string {
  if (!!i.clockIn !== !!i.clockOut) return "Fill in both Time in and Time out, or leave both empty.";
  if (i.clockIn && i.clockIn === i.clockOut) return "Time out must be different from Time in.";
  if (i.title.length > TITLE_MAX) return `The activity is ${i.title.length - TITLE_MAX} characters too long (limit ${TITLE_MAX}).`;
  if (i.description.length > DESC_MAX) return `The description is ${i.description.length - DESC_MAX} characters too long (limit ${DESC_MAX}).`;
  if (i.skills.length > SKILLS_MAX) return `Add at most ${SKILLS_MAX} skills.`;
  const wordy = i.skills.find((s) => s.split(/\s+/).filter(Boolean).length > SKILL_WORDS_MAX);
  if (wordy) return `"${wordy.slice(0, 24)}…" has too many words for a skill (limit ${SKILL_WORDS_MAX} words each). Separate skills with commas.`;
  const long = i.skills.find((s) => s.length > SKILL_MAX);
  if (long) return `"${long.slice(0, 20)}…" is too long for a skill (limit ${SKILL_MAX} characters each).`;
  return "";
}

export type EntryInput = {
  date: string; // YYYY-MM-DD
  /** HH:mm. The sort stamp: the clock-in time when the entry has hours, otherwise when it was logged. */
  time: string;
  /** Hours worked, HH:mm. Both or neither. Time out earlier than time in means the shift ran past midnight. */
  clockIn?: string;
  clockOut?: string;
  /** Length of the shift in minutes, stored so reports and totals do not recompute it. Set with clockIn and clockOut. */
  minutes?: number;
  /** The clock-in time was changed before clocking out. `originalStart` (HH:mm) and `originalStartDate` are when the clock really started. */
  startEdited?: boolean;
  originalStart?: string;
  originalStartDate?: string;
  title: string;
  skills: string[];
  description: string;
  /** What the author chose. Stored as-is, except that an entry in a private group is stored as "private" (see entryPrivacy.ts). */
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
  /** Entries written before visibility existed have none, and count as private. An entry in a private group is stored as "private". */
  visibility?: Visibility;
  /** The visibility chosen by the author while the entry sits in a private group; restored when it leaves. */
  lockedVisibility?: Visibility;
  /**
   * Only on placeholder cards: this is a post in a private group that the viewer is not in, with its content left out.
   * Never stored. Shown as "Join the group to see this post".
   */
  lockedGroupId?: string;
  /** Entries written before groups existed have none. */
  groupIds?: string[];
  /** Tucked away by its owner: hidden from the logbook, feeds, groups and share links, listed under Archived entries. */
  archived?: boolean;
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

/** The hours fields to store. A new document is written with set(), which cannot use deleteField(), so they are left out there. */
function hoursFields(input: EntryInput, isNew: boolean): Record<string, unknown> {
  if (input.clockIn && input.clockOut) {
    return { clockIn: input.clockIn, clockOut: input.clockOut, minutes: spanMinutes(input.clockIn, input.clockOut) };
  }
  return isNew ? {} : { clockIn: deleteField(), clockOut: deleteField(), minutes: deleteField() };
}

/** The input without its optional hours fields, so no undefined value reaches Firestore. */
const withoutHours = ({ clockIn: _a, clockOut: _b, minutes: _c, ...rest }: EntryInput) => rest;

export async function addEntry(uid: string, input: EntryInput, files: File[]): Promise<void> {
  if (files.length > MAX_PHOTOS) throw new Error(`Maximum ${MAX_PHOTOS} photos per entry`);
  const problem = entryTextProblem(input);
  if (problem) throw new Error(problem);
  const photos = await Promise.all(files.map(compressImage));

  const entryRef = doc(entriesRef(uid));
  const priv = await privateGroupIds(input.groupIds);
  const batch = writeBatch(db);
  batch.set(entryRef, { ...withoutHours(input), ...hoursFields(input, true), ...visibilityFields(input.visibility, priv.length > 0, true), photoCount: photos.length, createdAt: serverTimestamp() });
  teaserOp(batch, uid, entryRef.id, input.date, input.time, priv);
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
  const problem = entryTextProblem(input);
  if (problem) throw new Error(problem);
  const added = await Promise.all(newFiles.map(compressImage));

  const entryRef = doc(entriesRef(uid), entry.id);
  const extras = (await Promise.all(removeIds.map((id) => photoExtras(doc(collection(entryRef, "photos"), id))))).flat();
  const priv = await privateGroupIds(input.groupIds);
  const batch = writeBatch(db);
  extras.forEach((r) => batch.delete(r));
  batch.update(entryRef, {
    ...withoutHours(input),
    ...hoursFields(input, false),
    ...visibilityFields(input.visibility, priv.length > 0, false),
    photoCount: keep.length + added.length,
    updatedAt: serverTimestamp(),
  });
  teaserOp(batch, uid, entry.id, input.date, input.time, priv, entry.archived === true);
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
  batch.delete(teaserRef(uid, entry.id));
  batch.delete(entryRef);
  await batch.commit();
  logActivity(uid, `Deleted the entry “${entry.title}”`);
}

/** Sort and day-heading key: a repost sits where it was reposted, not where the original was written. */
export const stampOf = (e: Pick<Entry, "date" | "time" | "repostDate" | "repostTime">) =>
  `${e.repostDate ?? e.date} ${e.repostTime ?? e.time}`;
export const newestFirst = (a: Entry, b: Entry) => (stampOf(a) < stampOf(b) ? 1 : -1);

/** Archives an entry, or brings it back. Nothing is deleted: photos, comments and reactions stay where they are. */
export async function setEntryArchived(uid: string, entry: Entry, archived: boolean): Promise<void> {
  // An archived entry has no placeholder on the profile either.
  const priv = archived ? [] : await privateGroupIds(entry.groupIds ?? []);
  const batch = writeBatch(db);
  batch.update(doc(entriesRef(uid), entry.id), { archived });
  teaserOp(batch, uid, entry.id, entry.date, entry.time, priv, archived);
  await batch.commit();
  logActivity(uid, `${archived ? "Archived" : "Unarchived"} the entry “${entry.title}”`);
}

/** Changes who can see an existing entry, without touching anything else. */
export async function setEntryVisibility(uid: string, entry: Entry, visibility: Visibility): Promise<void> {
  const priv = await privateGroupIds(entry.groupIds ?? []);
  await updateDoc(doc(entriesRef(uid), entry.id), visibilityFields(visibility, priv.length > 0, false));
}

/** Changes which groups an existing entry is shared to, without touching anything else. */
export async function setEntryGroups(uid: string, entry: Entry, groupIds: string[]): Promise<void> {
  const priv = await privateGroupIds(groupIds);
  const batch = writeBatch(db);
  batch.update(doc(entriesRef(uid), entry.id), { groupIds, ...visibilityFields(chosenVisibility(entry), priv.length > 0, false) });
  teaserOp(batch, uid, entry.id, entry.date, entry.time, priv, entry.archived === true);
  groupIds.forEach((gid) => batch.set(groupPostRef(gid, uid, entry.id), { ownerUid: uid, entryId: entry.id, date: entry.date, time: entry.time }));
  (entry.groupIds ?? []).filter((gid) => !groupIds.includes(gid))
    .forEach((gid) => batch.delete(groupPostRef(gid, uid, entry.id)));
  await batch.commit();
}

export { entriesRef };
