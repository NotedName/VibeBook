import { useEffect, useMemo, useState } from "react";
import { collectionGroup, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { entriesRef, type Entry } from "./entries";

/** The most recent discoverable entries that are ranked each time. firestore.rules allows a limit of 100 at most. */
const POOL = 100;

/** "  React  JS " and "react js" are the same skill. */
const skillKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Skills you have used, with how many of your entries use each (archived entries and hours-only shifts do not count). */
export function useMySkills(uid: string, enabled: boolean): { skills: Map<string, number> | null; error: boolean } {
  const [skills, setSkills] = useState<Map<string, number> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    setError(false);
    return onSnapshot(
      query(entriesRef(uid)),
      (snap) => {
        const counts = new Map<string, number>();
        snap.docs.forEach((d) => {
          const e = d.data();
          if (e.archived === true || e.hoursOnly === true) return;
          new Set((e.skills as string[] | undefined ?? []).map(skillKey).filter(Boolean)).forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
        });
        setSkills(counts);
      },
      () => setError(true),
    );
  }, [uid, enabled]);
  return { skills, error };
}

/** Recent public entries of people with a public profile, newest first. `refreshKey` re-reads them (pull to refresh). */
export function useDiscoverEntries(enabled: boolean, refreshKey = 0) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    setLoading(true); setError("");
    return onSnapshot(
      query(collectionGroup(db, "entries"), where("discoverable", "==", true), orderBy("date", "desc"), limit(POOL)),
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ownerUid: d.ref.parent.parent!.id, ...d.data() }) as Entry));
        setLoading(false);
      },
      () => {
        setError("Could not load suggested entries. If you just deployed, the index can take a minute to build.");
        setLoading(false);
      },
    );
  }, [enabled, refreshKey]);
  return { entries, loading, error };
}

const DAY = 864e5;
const ageDays = (date: string, now: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.max(0, (now - new Date(y, m - 1, d).getTime()) / DAY);
};

/**
 * Orders other people's public entries by how well their skills match yours.
 *  - Each skill you use counts 1 + ln(n), where n is how many of your entries use it, so a skill you keep working on
 *    matters more than one you used once, with diminishing returns.
 *  - An entry's match is the sum of those weights over the skills it shares with you.
 *  - The match is divided by (1 + age in weeks), so a good match from last week beats a slightly better one from last year.
 *  - Entries that share no skill score 0 and follow the matches, newest first.
 * `skip` holds the people left out (yourself, and friends and followed people, whose entries are in the Following tab).
 */
export function rankForYou(pool: Entry[], mine: Map<string, number>, skip: Set<string>, now = Date.now()): Entry[] {
  const scored = pool
    .filter((e) => !skip.has(e.ownerUid ?? "") && e.archived !== true && e.hoursOnly !== true)
    .map((e) => {
      const shared = new Set((e.skills ?? []).map(skillKey).filter((k) => mine.has(k)));
      let match = 0;
      shared.forEach((k) => { match += 1 + Math.log(mine.get(k)!); });
      return { e, score: match / (1 + ageDays(e.date, now) / 7) };
    });
  return scored.sort((a, b) => b.score - a.score || (a.e.date + a.e.time < b.e.date + b.e.time ? 1 : -1)).map((x) => x.e);
}

/** The "For you" list: the discoverable pool ranked against your own skills. Empty until your skills have loaded. */
export function useForYou(uid: string, skip: Set<string>, enabled: boolean, refreshKey = 0) {
  const { skills, error: skillsError } = useMySkills(uid, enabled);
  const pool = useDiscoverEntries(enabled, refreshKey);
  const entries = useMemo(() => (skills ? rankForYou(pool.entries, skills, new Set([...skip, uid])) : []), [pool.entries, skills, skip, uid]);
  return {
    entries,
    loading: pool.loading || (enabled && skills === null && !skillsError),
    error: pool.error || (skillsError ? "Could not read your skills to suggest entries." : ""),
  };
}
