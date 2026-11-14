import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { ReactionType } from "./types";

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

/** Picking the reaction you already have takes it back. */
export function setReaction(ownerUid: string, entryId: string, uid: string, current: ReactionType | null, next: ReactionType) {
  const ref = doc(reactionsRef(ownerUid, entryId), uid);
  return current === next ? deleteDoc(ref) : setDoc(ref, { type: next, createdAt: serverTimestamp() });
}
