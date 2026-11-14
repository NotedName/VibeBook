import { useEffect, useMemo, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { newestFirst, type Entry } from "./entries";

/**
 * Entries shared to one group. The group's post index says which entries belong to it; each
 * entry is then followed live, so edits and deletions show up without reloading.
 */
export function useGroupEntries(gid: string, max = 40, dir: "asc" | "desc" = "desc") {
  const [byPost, setByPost] = useState<Record<string, Entry>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setByPost({}); setPending(new Set()); setIndexLoaded(false); setError("");
    const fail = () => setError("Could not load this group's entries. Check your connection.");
    const follows = new Map<string, () => void>();
    const settle = (postId: string) => setPending((prev) => {
      if (!prev.has(postId)) return prev;
      const next = new Set(prev); next.delete(postId); return next;
    });

    const stopIndex = onSnapshot(
      query(collection(db, "groups", gid, "posts"), orderBy("date", dir), limit(max)),
      (snap) => {
        const current = new Set(snap.docs.map((d) => d.id));
        for (const [postId, stop] of follows) {
          if (current.has(postId)) continue;
          stop(); follows.delete(postId);
          setByPost((prev) => { const next = { ...prev }; delete next[postId]; return next; });
          settle(postId);
        }
        snap.docs.forEach((d) => {
          if (follows.has(d.id)) return;
          const { ownerUid, entryId, repostedBy, date, time } =
            d.data() as { ownerUid: string; entryId: string; repostedBy?: string; date?: string; time?: string };
          setPending((prev) => new Set(prev).add(d.id));
          follows.set(d.id, onSnapshot(doc(db, "users", ownerUid, "entries", entryId), (s) => {
            setByPost((prev) => {
              const next = { ...prev };
              if (s.exists() && s.data().archived !== true) {
                next[d.id] = { id: s.id, ownerUid, ...s.data(),
                  ...(repostedBy ? { repostedBy, repostDate: date, repostTime: time } : {}) } as Entry;
              } else delete next[d.id];
              return next;
            });
            settle(d.id);
          }, () => {
            // A repost whose original is gone or no longer public just drops out of the feed.
            setByPost((prev) => { const next = { ...prev }; delete next[d.id]; return next; });
            settle(d.id);
          }));
        });
        setIndexLoaded(true);
      },
      fail,
    );
    return () => { stopIndex(); follows.forEach((stop) => stop()); };
  }, [gid, max, dir]);

  const entries = useMemo(
    () => Object.values(byPost).sort(newestFirst),
    [byPost],
  );
  return { entries, loading: !error && (!indexLoaded || pending.size > 0), error };
}
