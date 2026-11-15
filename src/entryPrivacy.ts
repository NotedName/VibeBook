import {
  collection, deleteField, doc, getDoc, getDocs, query, where, writeBatch,
  type DocumentData, type DocumentReference, type WriteBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Visibility } from "./types";

/**
 * Entries shared to a PRIVATE group are posted privately:
 *  - the entry is stored with visibility "private", so it is unreadable and unlisted for everyone but its owner and the
 *    members of the groups it is shared to (firestore.rules already works this way), and its share link stops working;
 *  - the visibility its author chose is kept in `lockedVisibility` and put back when it leaves every private group;
 *  - a small teaser, users/{uid}/teasers/{entryId}, tells profile visitors that a private post exists. It holds only the
 *    date and the private group ids, never the title, text or photos. Visitors who are not in the group see
 *    "Join the group to see this post" in its place.
 */
export type Teaser = { entryId: string; groupIds: string[]; date: string; time: string };

export const teaserRef = (uid: string, entryId: string) => doc(db, "users", uid, "teasers", entryId);
const entriesOf = (uid: string) => collection(db, "users", uid, "entries");

/** Which of these groups are private. Read fresh from the server (not the cache), because an admin may just have changed it. */
export async function privateGroupIds(gids: string[]): Promise<string[]> {
  const snaps = await Promise.all(gids.map((g) => getDoc(doc(db, "groups", g)).catch(() => null)));
  return snaps.flatMap((s) => (s && s.exists() && s.data().privacy === "private" ? [s.id] : []));
}

/** The visibility an author chose for an entry, whether or not it is locked right now. */
export const chosenVisibility = (e: { visibility?: Visibility; lockedVisibility?: Visibility }): Visibility =>
  e.lockedVisibility ?? e.visibility ?? "private";

/** Whether this person's profile is private (Settings > Privacy) or deactivated, so their entries stay out of other people's "For you" feed. Read fresh from the server. */
export async function profileIsPrivate(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "profiles", uid));
  return snap.exists() && (snap.data().privateProfile === true || snap.data().deactivated === true);
}

/**
 * `discoverable` marks an entry that may show in other people's "For you" feed: stored as public, and its owner's
 * profile is not private. firestore.rules lets the feed's collection group query read only entries with it set.
 */
export const isDiscoverable = (storedVisibility: Visibility | undefined, privateProfile: boolean) =>
  storedVisibility === "public" && !privateProfile;

/**
 * The visibility fields to store. `isNew` documents are written with set(), which cannot use deleteField(), so
 * fields that should vanish are simply left out there.
 */
export function visibilityFields(chosen: Visibility, inPrivateGroup: boolean, isNew: boolean, privateProfile: boolean): Record<string, unknown> {
  const discoverable = isDiscoverable(inPrivateGroup ? "private" : chosen, privateProfile);
  if (inPrivateGroup) {
    if (chosen === "private") return isNew ? { visibility: "private", discoverable } : { visibility: "private", lockedVisibility: deleteField(), discoverable };
    return { visibility: "private", lockedVisibility: chosen, discoverable };
  }
  return isNew ? { visibility: chosen, discoverable } : { visibility: chosen, lockedVisibility: deleteField(), discoverable };
}

/** Adds the teaser (or removes it) to a batch. */
export function teaserOp(batch: WriteBatch, uid: string, entryId: string, date: string, time: string, privateIds: string[], hidden = false) {
  if (privateIds.length > 0 && !hidden) batch.set(teaserRef(uid, entryId), { entryId, groupIds: privateIds.slice(0, 5), date, time });
  else batch.delete(teaserRef(uid, entryId));
}

/**
 * Brings the signed-in person's entries in line with their groups' current privacy. Runs when the app opens and after
 * leaving a group, so it also covers an admin switching a group between public and private after entries were shared:
 *  - entries in a private group get locked (and a teaser);
 *  - locked entries that are no longer in any private group get their chosen visibility back;
 *  - teasers with no matching locked, unarchived entry are removed;
 *  - public entries get `discoverable` set to match the profile (public profile: on, private profile: off), which
 *    also fills it in for entries written before it existed.
 * It only writes what differs, so most runs write nothing.
 */
export async function syncEntryPrivacy(uid: string): Promise<void> {
  const privateProfile = await profileIsPrivate(uid);
  const mine = await getDocs(query(collection(db, "groupMembers"), where("uid", "==", uid)));
  const groupDocs = await Promise.all(mine.docs.map((m) => getDoc(doc(db, "groups", m.data().groupId as string)).catch(() => null)));
  const priv = new Set(groupDocs.flatMap((g) => (g && g.exists() && g.data().privacy === "private" ? [g.id] : [])));

  const inPrivate = new Map<string, DocumentData & { ref: DocumentReference }>();
  const ids = [...priv];
  for (let i = 0; i < ids.length; i += 10) {
    const snap = await getDocs(query(entriesOf(uid), where("groupIds", "array-contains-any", ids.slice(i, i + 10))));
    snap.docs.forEach((d) => inPrivate.set(d.id, { ...d.data(), ref: d.ref }));
  }
  const locked = await getDocs(query(entriesOf(uid), where("lockedVisibility", "in", ["friends", "public"])));
  const teasers = await getDocs(collection(db, "users", uid, "teasers"));
  const haveTeaser = new Map<string, string[]>(
    teasers.docs.map((d) => [d.id, (d.data().groupIds as string[] | undefined) ?? []] as [string, string[]]),
  );

  const ops: ((b: WriteBatch) => void)[] = [];
  const wanted = new Set<string>();

  inPrivate.forEach((e, id) => {
    const privIds = ((e.groupIds as string[] | undefined) ?? []).filter((g) => priv.has(g));
    if ((e.visibility ?? "private") !== "private") {
      ops.push((b) => b.update(e.ref, { visibility: "private", lockedVisibility: e.visibility, discoverable: false }));
    }
    if (e.archived === true) return;
    wanted.add(id);
    const have = haveTeaser.get(id);
    if (!have || have.length !== privIds.length || privIds.some((g) => !have.includes(g))) {
      ops.push((b) => teaserOp(b, uid, id, e.date as string, e.time as string, privIds));
    }
  });

  locked.docs.forEach((d) => {
    if (inPrivate.has(d.id)) return;
    ops.push((b) => b.update(d.ref, {
      visibility: d.data().lockedVisibility, lockedVisibility: deleteField(), discoverable: isDiscoverable(d.data().lockedVisibility, privateProfile),
    }));
  });

  const open = await getDocs(query(entriesOf(uid), where("visibility", "==", "public")));
  open.docs.forEach((d) => {
    if (inPrivate.has(d.id)) return; // being locked above
    if (d.data().discoverable !== !privateProfile) ops.push((b) => b.update(d.ref, { discoverable: !privateProfile }));
  });

  haveTeaser.forEach((_, id) => { if (!wanted.has(id)) ops.push((b) => b.delete(teaserRef(uid, id))); });

  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}
