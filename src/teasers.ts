import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { newestFirst, type Entry } from "./entries";

/**
 * Posts that people shared to PRIVATE groups, for the Notes tab of their profile. The entry itself is not readable
 * by outsiders, so each one is found through its teaser (see entryPrivacy.ts):
 *  - someone in one of its groups sees the real entry, followed live;
 *  - everyone else gets a placeholder (no title, text or photos) that says to join the group to see it.
 * `memberOf` is the groups the viewer is in. Pass an empty set to see a profile as a stranger would.
 */
export function useTeasedEntries(uids: string[], memberOf: ReadonlySet<string>, max = 30, dir: "asc" | "desc" = "desc"): Entry[] {
  const lastSig = useRef("");
  const key = [...uids].sort().join(",");
  const memberKey = [...memberOf].sort().join(",");
  const [byKey, setByKey] = useState<Record<string, Entry>>({});

  useEffect(() => {
    const sig = `${key}|${max}|${dir}`;
    if (sig !== lastSig.current) { setByKey({}); lastSig.current = sig; }
    const mine = new Set(memberKey ? memberKey.split(",") : []);
    const stops: (() => void)[] = [];
    const drop = (k: string) => setByKey((prev) => { if (!(k in prev)) return prev; const n = { ...prev }; delete n[k]; return n; });
    (key ? key.split(",") : []).forEach((who) => {
      const follows = new Map<string, { sig: string; stop: () => void }>();
      stops.push(() => follows.forEach((f) => f.stop()));
      stops.push(onSnapshot(
        query(collection(db, "users", who, "teasers"), orderBy("date", dir), limit(max)),
        (snap) => {
          const current = new Set(snap.docs.map((d) => d.id));
          for (const [id, f] of follows) if (!current.has(id)) { f.stop(); follows.delete(id); drop(`${who}|${id}`); }
          snap.docs.forEach((d) => {
            const t = d.data() as { groupIds?: string[]; date?: string; time?: string };
            const gids = t.groupIds ?? [];
            const k = `${who}|${d.id}`;
            const tsig = `${gids.join(",")}|${t.date}|${t.time}`;
            if (follows.get(d.id)?.sig === tsig) return;
            follows.get(d.id)?.stop();
            const stub = () => setByKey((prev) => ({ ...prev, [k]: {
              id: d.id, ownerUid: who, date: t.date ?? "", time: t.time ?? "", title: "", skills: [], description: "",
              groupIds: [], photoCount: 0, createdAt: null, lockedGroupId: gids[0] ?? "",
            } as Entry }));
            if (!gids.some((g) => mine.has(g))) {
              stub();
              follows.set(d.id, { sig: tsig, stop: () => {} });
              return;
            }
            follows.set(d.id, { sig: tsig, stop: onSnapshot(
              doc(db, "users", who, "entries", d.id),
              (e) => {
                if (!e.exists() || e.data().archived === true) return drop(k);
                setByKey((prev) => ({ ...prev, [k]: { id: e.id, ownerUid: who, ...e.data() } as Entry }));
              },
              stub, // not allowed to read it after all (membership changed): fall back to the placeholder
            ) });
          });
        },
        () => {},
      ));
    });
    return () => stops.forEach((stop) => stop());
  }, [key, memberKey, max, dir]);

  return useMemo(() => Object.values(byKey).sort(newestFirst), [byKey]);
}
