import { logActivity } from "./activity";
import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import type { ReactionType } from "./types";
import { dropNote, pushNote } from "./notifications";
import { likeRef } from "./likes";

export type ReactionSummary = { vibing: number; notvibing: number; mine: ReactionType | null };

/** One document per person at users/{owner}/entries/{entry}/reactions/{reactorUid}. */
const reactionsRef = (ownerUid: string, entryId: string) =>
  collection(db, "users", ownerUid, "entries", entryId, "reactions");

/** Live counts for one entry, plus what myUid picked (undefined for signed-out viewers). */
export function useReactions(ownerUid: string, entryId: string, myUid?: string) {
  const [summary, setSummary] = useState<ReactionSummary | null>(null);
  const [error, setError] = useState(false);
  useEffect(
    () => onSnapshot(
      reactionsRef(ownerUid, entryId),
      (snap) => {
        const next: ReactionSummary = { vibing: 0, notvibing: 0, mine: null };
        snap.forEach((d) => {
          const type: unknown = d.data().type;
          if (type !== "vibing" && type !== "notvibing") return;
          next[type]++;
          if (d.id === myUid) next.mine = type;
        });
        setSummary(next);
        setError(false);
      },
      () => setError(true),
    ),
    [ownerUid, entryId, myUid],
  );
  return { summary, error };
}

/** What a like is about, so the owner's notification can say it. */
export type ReactionNote = { entryId: string; photoId?: string; title: string };

/**
 * Picking the reaction you already have takes it back. A "vibing" tells the owner; taking it back, or
 * switching to "not vibing", takes that notification back too.
 */
export async function setReaction(
  ownerUid: string, subject: string, uid: string, current: ReactionType | null, next: ReactionType, note?: ReactionNote,
) {
  const ref = doc(reactionsRef(ownerUid, subject), uid);
  // A "vibing" on a whole entry (not a single photo) also goes on your private Likes list, in the same write.
  const wholeEntry = !subject.includes("/"); // photo subjects look like "<entryId>/photos/<photoId>"
  const batch = writeBatch(db);
  if (current === next) batch.delete(ref);
  else batch.set(ref, { type: next, createdAt: serverTimestamp() });
  if (wholeEntry) {
    const like = likeRef(uid, ownerUid, subject);
    if (next === "vibing" && current !== "vibing") batch.set(like, { ownerUid, entryId: subject, createdAt: serverTimestamp() });
    else if (current === "vibing") batch.delete(like);
  }
  await batch.commit();
  const about = note?.title ? `“${note.title}”` : "an entry";
  logActivity(uid, current === next ? `Took back your reaction on ${about}` : next === "vibing" ? `Vibed ${about}` : `Passed on ${about}`);
  if (!note) return;
  const key = `like_${note.entryId}${note.photoId ? `_${note.photoId}` : ""}`;
  if (next === "vibing" && current !== "vibing") await pushNote(ownerUid, uid, key, "like", { ownerUid, ...note });
  else if (current === "vibing") await dropNote(ownerUid, uid, key);
}

export type Reactor = { uid: string; type: ReactionType; at: number };

/** Everyone who reacted to one of your entries, newest first. Only the entry's owner is offered this (see EntryCard). */
export function useReactors(ownerUid: string, entryId: string) {
  const [list, setList] = useState<Reactor[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(
    () => onSnapshot(
      reactionsRef(ownerUid, entryId),
      (snap) => {
        const out: Reactor[] = [];
        snap.forEach((d) => {
          const type: unknown = d.data().type;
          if (type !== "vibing" && type !== "notvibing") return;
          const ts = d.data().createdAt as { toMillis?: () => number } | null;
          out.push({ uid: d.id, type, at: ts?.toMillis ? ts.toMillis() : Date.now() });
        });
        setList(out.sort((a, b) => b.at - a.at));
        setError(false);
      },
      () => setError(true),
    ),
    [ownerUid, entryId],
  );
  return { list, error };
}
