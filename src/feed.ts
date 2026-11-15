import { useEffect, useMemo, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { newestFirst, type Entry } from "./entries";
import { fetchProfile } from "./profiles";

export type Source = { uid: string; friend: boolean };

/**
 * Entries other people share with you. Everyone's public entries are visible; a friend's
 * "friends" entries are too. Each is its own query so Firestore can verify access up front.
 */
export function useSharedEntries(sources: Source[], max = 60, dir: "asc" | "desc" = "desc", refreshKey = 0) {
  const lastSig = useRef("");
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
    // A new list of people (or direction) starts from nothing; a refresh keeps what is on screen while it re-reads.
    const sig = `${keys.join(",")}|${dir}`;
    if (sig !== lastSig.current) { setByQuery({}); lastSig.current = sig; }
    setLoaded(new Set()); setError("");
    const unsubs = keys.map((k) => {
      const [uid, visibility] = k.split(":");
      return onSnapshot(
        query(collection(db, "users", uid, "entries"), where("visibility", "==", visibility), orderBy("date", dir), limit(30)),
        (snap) => {
          setByQuery((prev) => ({ ...prev, [k]: snap.docs.filter((d) => d.data().archived !== true).map((d) => ({ id: d.id, ownerUid: uid, ...d.data() }) as Entry) }));
          setLoaded((prev) => new Set(prev).add(k));
        },
        () => {
          setError("Could not load shared entries. If you just deployed, the index can take a minute to build.");
          setLoaded((prev) => new Set(prev).add(k));
        },
      );
    });
    return () => unsubs.forEach((u) => u());
  }, [keys, dir, refreshKey]);

  const entries = useMemo(
    () => Object.values(byQuery).flat().sort(dir === "asc" ? (a, b) => -newestFirst(a, b) : newestFirst).slice(0, max),
    [byQuery, max, dir],
  );
  return { entries, loading: keys.length > 0 && loaded.size < keys.length, error };
}

/**
 * Which of these people have a private profile. Only their friends can read their entries, so a follower who is not a
 * friend must not query them. null while the profiles are loading.
 */
export function useLockedProfiles(uids: string[]): Set<string> | null {
  const key = [...uids].sort().join(",");
  const [locked, setLocked] = useState<{ key: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all((key ? key.split(",") : []).map(async (uid) => ((await fetchProfile(uid))?.privateProfile ? uid : null)))
      .then((ids) => live && setLocked({ key, ids: new Set(ids.filter((x): x is string => x !== null)) }))
      // If a profile cannot be read, nobody is treated as private; a private one then fails its query and the feed shows its error.
      .catch(() => live && setLocked({ key, ids: new Set() }));
    return () => { live = false; };
  }, [key]);
  return locked && locked.key === key ? locked.ids : null;
}
