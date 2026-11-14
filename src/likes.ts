import { useEffect, useMemo, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, type Firestore } from "firebase/firestore";
import { db } from "./firebase";
import type { Entry } from "./entries";

/**
 * Your Likes list: a private pointer at users/{me}/likes/{ownerUid}_{entryId} for every entry you gave a
 * "Vibing". The entry is never copied (its own rules still decide whether you can see it), and nobody else can read the list.
 * Written and removed by setReaction in reactions.ts; likes given before this list existed are not back-filled.
 */
export const likeId = (ownerUid: string, entryId: string) => `${ownerUid}_${entryId}`;
export const likeRef = (me: string, ownerUid: string, entryId: string, firestore: Firestore = db) =>
  doc(firestore, "users", me, "likes", likeId(ownerUid, entryId));

/** The entries you liked, most recently liked first. Each is followed live; one that was deleted or is no longer visible to you drops out. */
export function useLikedEntries(uid: string, enabled = true, max = 50): { entries: Entry[]; loading: boolean } {
  const [byKey, setByKey] = useState<Record<string, Entry>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    setByKey({}); setOrder([]); setLoading(true);
    const follows = new Map<string, () => void>();
    const drop = (k: string) => setByKey((prev) => { if (!(k in prev)) return prev; const n = { ...prev }; delete n[k]; return n; });
    const stop = onSnapshot(
      query(collection(db, "users", uid, "likes"), orderBy("createdAt", "desc"), limit(max)),
      (snap) => {
        const current = new Set(snap.docs.map((d) => d.id));
        for (const [id, s] of follows) if (!current.has(id)) { s(); follows.delete(id); drop(id); }
        setOrder(snap.docs.map((d) => d.id));
        setLoading(false);
        snap.docs.forEach((d) => {
          if (follows.has(d.id)) return;
          const { ownerUid, entryId } = d.data() as { ownerUid: string; entryId: string };
          follows.set(d.id, onSnapshot(
            doc(db, "users", ownerUid, "entries", entryId),
            (s) => {
              if (!s.exists()) return drop(d.id);
              setByKey((prev) => ({ ...prev, [d.id]: { id: s.id, ownerUid, ...s.data() } as Entry }));
            },
            () => drop(d.id),
          ));
        });
      },
      () => setLoading(false),
    );
    return () => { stop(); follows.forEach((s) => s()); };
  }, [uid, enabled, max]);

  // Keep the order you liked them in; the page's own sort can then reorder this list.
  const entries = useMemo(() => order.map((k) => byKey[k]).filter(Boolean), [order, byKey]);
  return { entries, loading };
}

