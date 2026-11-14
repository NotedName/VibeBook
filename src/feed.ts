import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { newestFirst, type Entry } from "./entries";

export type Source = { uid: string; friend: boolean };

/**
 * Entries other people share with you. Everyone's public entries are visible; a friend's
 * "friends" entries are too. Each is its own query so Firestore can verify access up front.
 */
export function useSharedEntries(sources: Source[], max = 60) {
  const key = sources.map((s) => `${s.uid}:${s.friend ? 1 : 0}`).sort().join(",");
  const [byQuery, setByQuery] = useState<Record<string, Entry[]>>({});
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const keys = useMemo(
    () => (key ? key.split(",").flatMap((k) => {
      const [uid, f] = k.split(":");
      return f === "1" ? [`${uid}:public`, `${uid}:friends`] : [`${uid}:public`];
    }) : []),
    [key],
  );

  useEffect(() => {
    setByQuery({}); setLoaded(new Set()); setError("");
    const unsubs = keys.map((k) => {
      const [uid, visibility] = k.split(":");
      return onSnapshot(
        query(collection(db, "users", uid, "entries"), where("visibility", "==", visibility), orderBy("date", "desc"), limit(30)),
        (snap) => {
          setByQuery((prev) => ({ ...prev, [k]: snap.docs.map((d) => ({ id: d.id, ownerUid: uid, ...d.data() }) as Entry) }));
          setLoaded((prev) => new Set(prev).add(k));
        },
        () => {
          setError("Could not load shared entries. If you just deployed, the index can take a minute to build.");
          setLoaded((prev) => new Set(prev).add(k));
        },
      );
    });
    return () => unsubs.forEach((u) => u());
  }, [keys]);

  const entries = useMemo(
    () => Object.values(byQuery).flat().sort(newestFirst).slice(0, max),
    [byQuery, max],
  );
  return { entries, loading: keys.length > 0 && loaded.size < keys.length, error };
}
