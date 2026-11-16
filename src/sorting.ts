import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, type Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { stampOf, type Entry } from "./entries";

/** How a list of entries is ordered. "hot" and "popular" look at reactions and comments; the others at the date. */
export type SortKind = "newest" | "oldest" | "hot" | "popular";
export type Period = "day" | "week" | "month" | "year";
export type SortMode = { kind: SortKind; period: Period };

export const SORT_KINDS: { id: SortKind; label: string; hint: string }[] = [
  { id: "newest", label: "Newest", hint: "Most recent first" },
  { id: "hot", label: "Hottest", hint: "Lots of activity, and recent" },
  { id: "popular", label: "Popular", hint: "Most reactions and comments in a period" },
  { id: "oldest", label: "Oldest", hint: "Oldest first" },
];
export const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
];

export const DEFAULT_SORT: SortMode = { kind: "newest", period: "week" };
/** Hottest and Popular need reaction and comment data; the date sorts do not. */
export const needsEngagement = (m: SortMode) => m.kind === "hot" || m.kind === "popular";
/** Which end of the date index to read from. Oldest has to ask the database for the oldest, not just flip what is loaded. */
export const dateDir = (m: SortMode): "asc" | "desc" => (m.kind === "oldest" ? "asc" : "desc");

const kinds = new Set<string>(SORT_KINDS.map((k) => k.id));
const periods = new Set<string>(PERIODS.map((p) => p.id));

/** The chosen sort, remembered on this device (per list, e.g. "feed" or "logbook"). */
export function useSortMode(key: string): [SortMode, (m: SortMode) => void] {
  const storeKey = `vibebook.sort.${key}`;
  const [mode, setMode] = useState<SortMode>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storeKey) ?? "null");
      if (raw && kinds.has(raw.kind) && periods.has(raw.period)) return raw as SortMode;
    } catch { /* storage blocked or corrupt: fall through */ }
    return DEFAULT_SORT;
  });
  const set = useCallback((m: SortMode) => {
    setMode(m);
    try { localStorage.setItem(storeKey, JSON.stringify(m)); } catch { /* not remembered, still works */ }
  }, [storeKey]);
  return [mode, set];
}

/** How a list of your own entries is grouped: under week headings (each with its total hours) and day headings, or under day headings only. */
export type Grouping = "weeks" | "days";

/** The logbook's view of your notes: Days (grouped by day), Weeks (grouped by week, with each week's hours) or Months (a calendar). */
export type LogbookView = "days" | "weeks" | "months";
export const LOGBOOK_VIEWS: readonly { id: LogbookView; label: string }[] = [
  { id: "days", label: "Days" }, { id: "weeks", label: "Weeks" }, { id: "months", label: "Months" },
];

/**
 * The chosen view, remembered on this device. Before Days / Weeks / Months existed the choice was a Weeks / Days grouping
 * (stored under vibebook.group.*), so that older answer is the starting point.
 */
export function useLogbookView(key: string): [LogbookView, (v: LogbookView) => void] {
  const storeKey = `vibebook.view.${key}`;
  const [view, setView] = useState<LogbookView>(() => {
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved === "days" || saved === "weeks" || saved === "months") return saved;
      return localStorage.getItem(`vibebook.group.${key}`) === "days" ? "days" : "weeks";
    } catch { return "weeks"; }
  });
  const set = useCallback((v: LogbookView) => {
    setView(v);
    try { localStorage.setItem(storeKey, v); } catch { /* not remembered, still works */ }
  }, [storeKey]);
  return [view, set];
}

/** When each reaction and comment on an entry happened (ms since 1970). */
export type Engagement = { up: number[]; down: number[]; comments: number[] };
const NONE: Engagement = { up: [], down: [], comments: [] };

const keyOf = (e: Pick<Entry, "ownerUid" | "id">) => `${e.ownerUid}/${e.id}`;
const ms = (t: unknown) => (t && typeof (t as Timestamp).toMillis === "function" ? (t as Timestamp).toMillis() : Date.now());

/** Two live queries per entry, so no more than this many entries are followed at once. */
const ENGAGEMENT_MAX = 40;

/**
 * Follows the reactions and comments of these entries, but only while `enabled` (a date sort needs
 * none of it). One live query each per entry, so it is meant for the few dozen entries a page shows.
 */
export function useEngagement(entries: Entry[], enabled: boolean): Map<string, Engagement> {
  const key = useMemo(
    () => (enabled ? [...new Set(entries.filter((e) => e.ownerUid).map(keyOf))].sort().slice(0, ENGAGEMENT_MAX).join(",") : ""),
    [entries, enabled],
  );
  const [data, setData] = useState<Record<string, Engagement>>({});

  useEffect(() => {
    setData({});
    const stops: (() => void)[] = [];
    (key ? key.split(",") : []).forEach((k) => {
      const [uid, id] = k.split("/");
      const patch = (p: Partial<Engagement>) => setData((prev) => ({ ...prev, [k]: { ...(prev[k] ?? NONE), ...p } }));
      stops.push(onSnapshot(collection(db, "users", uid, "entries", id, "reactions"), (snap) => {
        const up: number[] = [], down: number[] = [];
        snap.forEach((d) => {
          const x = d.data();
          if (x.type === "vibing") up.push(ms(x.createdAt));
          else if (x.type === "notvibing") down.push(ms(x.createdAt));
        });
        patch({ up, down });
      }, () => {}));
      stops.push(onSnapshot(collection(db, "users", uid, "entries", id, "comments"), (snap) => {
        patch({ comments: snap.docs.filter((d) => d.data().deleted !== true).map((d) => ms(d.data().createdAt)) });
      }, () => {}));
    });
    return () => stops.forEach((s) => s());
  }, [key]);

  return useMemo(() => new Map(Object.entries(data)), [data]);
}

/** Start of the period: today is since local midnight, the others are the last 7, 30 and 365 days. */
export function periodStart(p: Period, now = Date.now()): number {
  if (p === "day") { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
  const days = p === "week" ? 7 : p === "month" ? 30 : 365;
  return now - days * 864e5;
}

const when = (e: Entry) => {
  const t = new Date(stampOf(e).replace(" ", "T")).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const inWindow = (times: number[], from: number) => times.reduce((n, t) => (t >= from ? n + 1 : n), 0);

/** Net "vibing" plus comments, counting only what happened since `from` (0 = ever). */
const activity = (s: Engagement, from: number) => inWindow(s.up, from) - inWindow(s.down, from) + inWindow(s.comments, from);

/**
 * Orders entries. Hottest is activity divided by age (an hour-old entry with a few reactions beats a
 * month-old one with many); Popular is activity inside the chosen period, whenever the entry was written.
 * Entries tied on score stay newest first.
 */
export function sortEntries(entries: Entry[], mode: SortMode, stats: Map<string, Engagement>, now = Date.now()): Entry[] {
  const byDate = (a: Entry, b: Entry) => when(b) - when(a);
  if (mode.kind === "newest") return [...entries].sort(byDate);
  if (mode.kind === "oldest") return [...entries].sort((a, b) => byDate(b, a));
  const from = mode.kind === "popular" ? periodStart(mode.period, now) : 0;
  const score = (e: Entry) => {
    const s = stats.get(keyOf(e)) ?? NONE;
    const a = activity(s, from);
    if (mode.kind === "popular") return a;
    const ageHours = Math.max(0, (now - when(e)) / 36e5);
    return a / Math.pow(ageHours + 2, 1.5);
  };
  const scored = new Map(entries.map((e) => [e, score(e)]));
  return [...entries].sort((a, b) => scored.get(b)! - scored.get(a)! || byDate(a, b));
}

/** Sorts a list by the chosen mode, following reactions and comments only when the mode needs them. */
export function useSortedEntries(entries: Entry[], mode: SortMode): Entry[] {
  const stats = useEngagement(entries, needsEngagement(mode));
  return useMemo(() => sortEntries(entries, mode, stats), [entries, mode, stats]);
}
