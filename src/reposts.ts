import { logActivity } from "./activity";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { newestFirst, type Entry } from "./entries";
import { fetchGroup, groupsHoldingEntry, repostPostRef } from "./groups";
import { useSession } from "./session";
import { nowStr, todayStr } from "./report";
import { dropNote, pushNote } from "./notifications";

/**
 * A repost puts someone else's public entry in your own logbook, and optionally in groups.
 * Stored at users/{me}/reposts/{ownerUid}_{entryId}; the entry itself is never copied, so
 * edits, comments and reactions all stay on the original.
 */
export type Repost = { id: string; ownerUid: string; entryId: string; date: string; time: string; groupIds: string[] };

export const repostId = (ownerUid: string, entryId: string) => `${ownerUid}_${entryId}`;
const repostRef = (me: string, ownerUid: string, entryId: string) =>
  doc(db, "users", me, "reposts", repostId(ownerUid, entryId));
const toRepost = (id: string, d: Record<string, unknown>): Repost => ({
  id, ownerUid: d.ownerUid as string, entryId: d.entryId as string,
  date: (d.date as string) ?? "", time: (d.time as string) ?? "", groupIds: (d.groupIds as string[]) ?? [],
});

const postFields = (me: string, r: Pick<Repost, "ownerUid" | "entryId" | "date" | "time">) =>
  ({ ownerUid: r.ownerUid, entryId: r.entryId, date: r.date, time: r.time, repostedBy: me });

/** Thrown when a repost would put an entry in a group that already has it. */
export class AlreadyInGroupError extends Error {
  constructor(public groupIds: string[]) { super("That post is already in one of the groups you picked."); }
}

/**
 * Reposts an entry, or changes which groups an existing repost is shared to. An entry can be in a group only once:
 * a group that already has it (as the original post or someone's repost) is refused.
 */
export async function saveRepost(me: string, entry: Entry, groupIds: string[], prev?: Repost): Promise<void> {
  const ownerUid = entry.ownerUid!;
  const r = prev ?? { ownerUid, entryId: entry.id, date: todayStr(), time: nowStr(), groupIds: [] as string[] };
  const added = groupIds.filter((gid) => !r.groupIds.includes(gid));
  const taken = added.length ? await groupsHoldingEntry(added, ownerUid, entry.id, me) : new Set<string>();
  if (taken.size > 0) throw new AlreadyInGroupError([...taken]);
  const batch = writeBatch(db);
  if (prev) batch.update(repostRef(me, ownerUid, entry.id), { groupIds });
  else batch.set(repostRef(me, ownerUid, entry.id), {
    ownerUid, entryId: entry.id, date: r.date, time: r.time, groupIds, createdAt: serverTimestamp(),
  });
  added.forEach((gid) => batch.set(repostPostRef(gid, me, ownerUid, entry.id), postFields(me, r)));
  r.groupIds.filter((gid) => !groupIds.includes(gid))
    .forEach((gid) => batch.delete(repostPostRef(gid, me, ownerUid, entry.id)));
  await batch.commit();
  logActivity(me, prev ? `Changed the groups of your repost of “${entry.title}”` : `Reposted “${entry.title}”`, { who: ownerUid });
  if (!prev) await pushNote(ownerUid, me, `repost_${entry.id}`, "repost", { ownerUid, entryId: entry.id, title: entry.title });
}

export async function removeRepost(me: string, r: Repost): Promise<void> {
  const batch = writeBatch(db);
  r.groupIds.forEach((gid) => batch.delete(repostPostRef(gid, me, r.ownerUid, r.entryId)));
  batch.delete(repostRef(me, r.ownerUid, r.entryId));
  await batch.commit();
  logActivity(me, "Removed a repost", { who: r.ownerUid });
  await dropNote(r.ownerUid, me, `repost_${r.entryId}`);
}

/** Live map of the signed-in person's reposts, by "<ownerUid>_<entryId>". */
export function useMyReposts(uid: string): Map<string, Repost> {
  const [list, setList] = useState<Repost[]>([]);
  useEffect(
    () => onSnapshot(
      collection(db, "users", uid, "reposts"),
      (snap) => setList(snap.docs.map((d) => toRepost(d.id, d.data()))),
      () => setList([]),
    ),
    [uid],
  );
  return useMemo(() => new Map(list.map((r) => [r.id, r])), [list]);
}

/**
 * The entries these people have reposted, newest first (or the oldest ones, with dir "asc"; the caller sorts). Each original is followed live; one that
 * was deleted or is no longer public simply drops out.
 *
 * A repost shared to a private group is posted privately: to anyone who is not in that group (and not the person
 * who reposted it) it is left out of the list ("hide") or turned into a "join the group to see this" placeholder ("stub").
 */
export function useRepostedEntries(
  uids: string[], perPerson = 15, dir: "asc" | "desc" = "desc", refreshKey = 0, locked: "hide" | "stub" = "hide",
): Entry[] {
  const s = useSession();
  const lastSig = useRef("");
  const key = [...uids].sort().join(",");
  const memberKey = [...s.groups.ids].sort().join(",");
  const [byKey, setByKey] = useState<Record<string, Entry>>({});

  useEffect(() => {
    const sig = `${key}|${perPerson}|${dir}`;
    if (sig !== lastSig.current) { setByKey({}); lastSig.current = sig; }
    const mine = new Set(memberKey ? memberKey.split(",") : []);
    let live = true;
    const stops: (() => void)[] = [];
    const drop = (k: string) => setByKey((prev) => { if (!(k in prev)) return prev; const n = { ...prev }; delete n[k]; return n; });
    (key ? key.split(",") : []).forEach((who) => {
      const follows = new Map<string, { sig: string; stop: () => void }>();
      stops.push(() => follows.forEach((f) => f.stop()));
      stops.push(onSnapshot(
        query(collection(db, "users", who, "reposts"), orderBy("date", dir), limit(perPerson)),
        (snap) => {
          const current = new Set(snap.docs.map((d) => d.id));
          for (const [id, f] of follows) if (!current.has(id)) { f.stop(); follows.delete(id); drop(`${who}|${id}`); }
          snap.docs.forEach((d) => {
            const r = toRepost(d.id, d.data());
            const k = `${who}|${d.id}`;
            const rsig = r.groupIds.join(",");
            const old = follows.get(d.id);
            if (old?.sig === rsig) return;
            old?.stop();
            // reserve the slot now so a second snapshot does not start a second follow while privacy is looked up
            follows.set(d.id, { sig: rsig, stop: () => {} });
            const follow = () => follows.set(d.id, { sig: rsig, stop: onSnapshot(
              doc(db, "users", r.ownerUid, "entries", r.entryId),
              (e) => {
                if (!e.exists() || e.data().archived === true) return drop(k); // archived originals disappear from reposts too
                setByKey((prev) => ({ ...prev, [k]: {
                  id: e.id, ownerUid: r.ownerUid, ...e.data(), repostedBy: who, repostDate: r.date, repostTime: r.time,
                } as Entry }));
              },
              () => drop(k),
            ) });
            const outsider = who !== s.uid && r.groupIds.length > 0;
            if (!outsider) return follow();
            Promise.all(r.groupIds.map((g) => fetchGroup(g).catch(() => null))).then((groups) => {
              if (!live || follows.get(d.id)?.sig !== rsig) return;
              const hidden = groups.find((g) => g && g.privacy === "private" && !mine.has(g.id));
              if (!hidden) return follow();
              if (locked === "stub") {
                setByKey((prev) => ({ ...prev, [k]: {
                  id: r.entryId, ownerUid: r.ownerUid, date: r.date, time: r.time, title: "", skills: [], description: "",
                  groupIds: [], photoCount: 0, createdAt: null, lockedGroupId: hidden.id,
                  repostedBy: who, repostDate: r.date, repostTime: r.time,
                } as Entry }));
              } else drop(k);
            });
          });
        },
        () => {},
      ));
    });
    return () => { live = false; stops.forEach((stop) => stop()); };
  }, [key, perPerson, dir, refreshKey, memberKey, locked, s.uid]);

  return useMemo(() => Object.values(byKey).sort(newestFirst), [byKey]);
}
