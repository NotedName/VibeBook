import { logActivity } from "./activity";
import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { ReactionType } from "./types";
import { dropNote, pushNote } from "./notifications";

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
  if (current === next) await deleteDoc(ref);
  else await setDoc(ref, { type: next, createdAt: serverTimestamp() });
  const about = note?.title ? `“${note.title}”` : "an entry";
  logActivity(uid, current === next ? `Took back your reaction on ${about}` : next === "vibing" ? `Vibed ${about}` : `Marked ${about} as not vibing`);
  if (!note) return;
  const key = `like_${note.entryId}${note.photoId ? `_${note.photoId}` : ""}`;
  if (next === "vibing" && current !== "vibing") await pushNote(ownerUid, uid, key, "like", { ownerUid, ...note });
  else if (current === "vibing") await dropNote(ownerUid, uid, key);
}
