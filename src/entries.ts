import { logActivity } from "./activity";
import {
  collection, deleteField, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, writeBatch,
  type DocumentReference, type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { compressImage } from "./image";
import { groupPostRef } from "./groups";
import { chosenVisibility, privateGroupIds, profileIsPrivate, teaserOp, teaserRef, visibilityFields } from "./entryPrivacy";
import type { Visibility } from "./types";
import { spanMinutes } from "./weeks";
import { takeTurn } from "./rateLimit";
import { isGifUrl } from "./stickers";

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

/** The activity is a short list like the skills: separated by commas, each one a few words. */
export const ACTIVITY_MAX = 40;
export const ACTIVITY_WORDS_MAX = 4;
export const ACTIVITIES_MAX = 5;
export const splitList = (text: string): string[] => text.split(",").map((x) => x.trim()).filter(Boolean);

/** What is wrong with an entry's text, or "" when it fits the limits. */
export function entryTextProblem(i: Pick<EntryInput, "title" | "description" | "skills" | "clockIn" | "clockOut">): string {
  if (!!i.clockIn !== !!i.clockOut) return "Fill in both Time in and Time out, or leave both empty.";
  if (i.clockIn && i.clockIn === i.clockOut) return "Time out must be different from Time in.";
  const acts = splitList(i.title);
  if (acts.length === 0) return "Add at least one activity.";
  if (acts.length > ACTIVITIES_MAX) return `Add at most ${ACTIVITIES_MAX} activities.`;
  const actWordy = acts.find((a) => a.split(/\s+/).length > ACTIVITY_WORDS_MAX);
  if (actWordy) return `"${actWordy.slice(0, 24)}…" has too many words for an activity (limit ${ACTIVITY_WORDS_MAX} words each). Separate activities with commas.`;
  const actLong = acts.find((a) => a.length > ACTIVITY_MAX);
  if (actLong) return `"${actLong.slice(0, 20)}…" is too long for an activity (limit ${ACTIVITY_MAX} characters each).`;
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
  /** Length of the shift in minutes, break time left out, stored so reports and totals do not recompute it. Set with clockIn and clockOut. */
  minutes?: number;
  /** Minutes of break taken during the shift (taken out of `minutes`). */
  breakMinutes?: number;
  /** Written by Clock out: the shift counts as hours only. It is listed under Logged hours, not in the logbook. */
  hoursOnly?: boolean;
  /** The clock-in time was changed before clocking out. `originalStart` (HH:mm) and `originalStartDate` are when the clock really started. */
  startEdited?: boolean;
  originalStart?: string;
  originalStartDate?: string;
  title: string;
  skills: string[];
  description: string;
  /** What the author chose. Stored as-is, except that an entry in a private group is stored as "private" (see entryPrivacy.ts). */
  visibility: Visibility;
  /** with a private group ticked: keep the entry on the profile to `visibility` as well (see entryPrivacy.ts) */
  alsoOnProfile?: boolean;
  /** Groups whose members can see and comment on this entry. */
  groupIds: string[];
  /** https link to a YouTube or Vimeo video, or a direct .mp4/.webm file. "" when none. */
  videoUrl: string;
  /** A moving GIF shown on the post, loaded from Giphy or Tenor like the GIFs in messages (see isGifUrl in stickers.ts). "" or left out when none. */
  gif?: string;
};

export type Entry = Omit<EntryInput, "visibility" | "videoUrl"> & {
  /** Entries written before video links existed have none. */
  videoUrl?: string;
  id: string;
  /** Entries written before visibility existed have none, and count as private. An entry in a private group is stored as "private". */
  visibility?: Visibility;
  /** The visibility chosen by the author while the entry sits in a private group; restored when it leaves. */
  lockedVisibility?: Visibility;
  /** Shared to a private group but ALSO shown on the owner's profile, to the visibility they chose: such an entry is not locked to private. */
  alsoOnProfile?: boolean;
  /** Stored public and its owner's profile is not private: the entry may show in other people's "For you" feed. See entryPrivacy.ts. */
  discoverable?: boolean;
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
    return { clockIn: input.clockIn, clockOut: input.clockOut, minutes: Math.max(0, spanMinutes(input.clockIn, input.clockOut) - (input.breakMinutes ?? 0)) };
  }
  return isNew ? {} : { clockIn: deleteField(), clockOut: deleteField(), minutes: deleteField() };
}

/** The input without its optional hours and GIF fields, so no undefined value reaches Firestore. */
const withoutHours = ({ clockIn: _a, clockOut: _b, minutes: _c, gif: _d, alsoOnProfile: _e, ...rest }: EntryInput) => rest;

/** The GIF field to store. A new document is written with set(), which cannot use deleteField(), so it is left out there. */
function gifFields(input: EntryInput, isNew: boolean): Record<string, unknown> {
  if (input.gif) return { gif: input.gif };
  return isNew ? {} : { gif: deleteField() };
}

/** What is wrong with an entry's GIF, or "" when there is none or it is fine. */
const gifProblem = (input: Pick<EntryInput, "gif">) => (input.gif && !isGifUrl(input.gif) ? "That GIF link is not supported. Pick a GIF from Giphy or Tenor." : "");

export async function addEntry(uid: string, input: EntryInput, files: File[]): Promise<void> {
  if (files.length > MAX_PHOTOS) throw new Error(`Maximum ${MAX_PHOTOS} photos per entry`);
  const problem = entryTextProblem(input) || gifProblem(input);
  if (problem) throw new Error(problem);
  takeTurn("entry");
  const photos = await Promise.all(files.map(compressImage));

  const entryRef = doc(entriesRef(uid));
  const priv = input.alsoOnProfile === true ? [] : await privateGroupIds(input.groupIds);
  const privateProfile = await profileIsPrivate(uid);
  const batch = writeBatch(db);
  batch.set(entryRef, { ...withoutHours(input), ...hoursFields(input, true), ...gifFields(input, true), ...visibilityFields(input.visibility, priv.length > 0, true, privateProfile), ...(input.alsoOnProfile === true ? { alsoOnProfile: true } : {}), photoCount: photos.length, createdAt: serverTimestamp() });
  teaserOp(batch, uid, entryRef.id, input.date, input.time, priv);
  // The rules accept a new entry only together with this stamp, and refuse the stamp when the last one is under 5 seconds old.
  batch.set(doc(db, "rate", uid), { entryAt: serverTimestamp() }, { merge: true });
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
  const problem = entryTextProblem(input) || gifProblem(input);
  if (problem) throw new Error(problem);
  const added = await Promise.all(newFiles.map(compressImage));

  const entryRef = doc(entriesRef(uid), entry.id);
  const extras = (await Promise.all(removeIds.map((id) => photoExtras(doc(collection(entryRef, "photos"), id))))).flat();
  const priv = input.alsoOnProfile === true ? [] : await privateGroupIds(input.groupIds);
  const privateProfile = await profileIsPrivate(uid);
  const batch = writeBatch(db);
  extras.forEach((r) => batch.delete(r));
  batch.update(entryRef, {
    ...withoutHours(input),
    ...hoursFields(input, false),
    ...gifFields(input, false),
    ...visibilityFields(input.visibility, priv.length > 0, false, privateProfile),
    alsoOnProfile: input.alsoOnProfile === true ? true : deleteField(),
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
  const priv = archived || entry.alsoOnProfile === true ? [] : await privateGroupIds(entry.groupIds ?? []);
  const batch = writeBatch(db);
  batch.update(doc(entriesRef(uid), entry.id), { archived });
  teaserOp(batch, uid, entry.id, entry.date, entry.time, priv, archived);
  await batch.commit();
  logActivity(uid, `${archived ? "Archived" : "Unarchived"} the entry “${entry.title}”`);
}

/** Changes who can see an existing entry, without touching anything else. */
export async function setEntryVisibility(uid: string, entry: Entry, visibility: Visibility): Promise<void> {
  const priv = entry.alsoOnProfile === true ? [] : await privateGroupIds(entry.groupIds ?? []);
  const privateProfile = await profileIsPrivate(uid);
  await updateDoc(doc(entriesRef(uid), entry.id), visibilityFields(visibility, priv.length > 0, false, privateProfile));
}

/** Changes which groups an existing entry is shared to, without touching anything else. */
export async function setEntryGroups(uid: string, entry: Entry, groupIds: string[], alsoOnProfile = entry.alsoOnProfile === true, visibility = chosenVisibility(entry)): Promise<void> {
  const priv = alsoOnProfile ? [] : await privateGroupIds(groupIds);
  const privateProfile = await profileIsPrivate(uid);
  const batch = writeBatch(db);
  batch.update(doc(entriesRef(uid), entry.id), { groupIds, alsoOnProfile: alsoOnProfile ? true : deleteField(), ...visibilityFields(visibility, priv.length > 0, false, privateProfile) });
  teaserOp(batch, uid, entry.id, entry.date, entry.time, priv, entry.archived === true);
  groupIds.forEach((gid) => batch.set(groupPostRef(gid, uid, entry.id), { ownerUid: uid, entryId: entry.id, date: entry.date, time: entry.time }));
  (entry.groupIds ?? []).filter((gid) => !groupIds.includes(gid))
    .forEach((gid) => batch.delete(groupPostRef(gid, uid, entry.id)));
  await batch.commit();
}

export { entriesRef };

/** Every entry you own, archived ones too. */
export async function listAllEntries(uid: string): Promise<Entry[]> {
  const snap = await getDocs(entriesRef(uid));
  return snap.docs.map((d) => ({ id: d.id, ownerUid: uid, ...d.data() }) as Entry);
}

/** Archives every entry that is not archived yet (nothing is deleted). Returns how many were archived. */
export async function archiveAllEntries(uid: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const todo = (await listAllEntries(uid)).filter((e) => e.archived !== true);
  for (let i = 0; i < todo.length; i++) { await setEntryArchived(uid, todo[i], true); onProgress?.(i + 1, todo.length); }
  return todo.length;
}

/** Deletes every entry you own with its photos, comments, reactions and group posts. It cannot be undone. Returns how many were deleted. */
export async function deleteAllEntries(uid: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const all = await listAllEntries(uid);
  for (let i = 0; i < all.length; i++) { await deleteEntry(uid, all[i]); onProgress?.(i + 1, all.length); }
  return all.length;
}

/** Changes only the hours of an entry: its day, time in, time out and break. The text, photos and sharing are left alone. */
export async function updateEntryHours(uid: string, entry: Entry, h: { date: string; clockIn: string; clockOut: string; breakMinutes: number }): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(entriesRef(uid), entry.id), {
    date: h.date, time: h.clockIn, clockIn: h.clockIn, clockOut: h.clockOut,
    minutes: Math.max(0, spanMinutes(h.clockIn, h.clockOut) - h.breakMinutes),
    breakMinutes: h.breakMinutes > 0 ? h.breakMinutes : deleteField(),
  });
  (entry.groupIds ?? []).forEach((gid) => batch.update(groupPostRef(gid, uid, entry.id), { date: h.date, time: h.clockIn }));
  await batch.commit();
}

/**
 * Deletes the hours of one entry. A shift saved only as hours (by Clock out) is deleted altogether; on a logbook entry only the hours
 * (time in and out, break, minutes) are removed and the entry stays.
 */
export async function deleteHours(uid: string, entry: Entry): Promise<void> {
  if (entry.hoursOnly) return deleteEntry(uid, entry);
  await updateDoc(doc(entriesRef(uid), entry.id), {
    clockIn: deleteField(), clockOut: deleteField(), minutes: deleteField(), breakMinutes: deleteField(),
    startEdited: deleteField(), originalStart: deleteField(), originalStartDate: deleteField(),
  });
}

/** Removes every logged hour you have, and the running clock. Entries that have text stay. Returns how many shifts were removed. */
export async function resetAllHours(uid: string, onProgress?: (done: number, total: number) => void): Promise<number> {
  const withHours = (await listAllEntries(uid)).filter((e) => e.clockIn || e.clockOut || e.hoursOnly);
  for (let i = 0; i < withHours.length; i++) { await deleteHours(uid, withHours[i]); onProgress?.(i + 1, withHours.length); }
  return withHours.length;
}
