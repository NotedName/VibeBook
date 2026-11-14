import { useMemo, useSyncExternalStore } from "react";
import type { Note, NoteType } from "./notifications";

/**
 * Who you interact with most. Two signals are added up per friend:
 *  - what you did to them (likes, comments, replies, reposts, ...), counted on this device by noteInteraction,
 *  - what they did to you, read from your notifications (which live in your account, so they follow you around).
 * Comments and replies count most, then reposts, then likes. Ties go to the more recent interaction.
 */
const MAX_TRACKED = 200;
type Stat = { n: number; at: number };
type Book = Record<string, Stat>;

const key = (uid: string) => `vibebook-interactions-${uid}`;
const cache = new Map<string, Book>();
const listeners = new Set<() => void>();

function book(uid: string): Book {
  let b = cache.get(uid);
  if (!b) {
    try {
      const raw = JSON.parse(localStorage.getItem(key(uid)) ?? "{}");
      b = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Book) : {};
    } catch { b = {}; }
    cache.set(uid, b);
  }
  return b;
}

const WEIGHT: Partial<Record<NoteType, number>> = { comment: 3, reply: 3, repost: 2, like: 1, comment_like: 1 };
export const interactionWeight = (type: NoteType): number => WEIGHT[type] ?? 1;

/** Records that `me` did something involving `other`. Never throws. */
export function noteInteraction(me: string, other: string, weight = 1) {
  if (!me || !other || me === other) return;
  const next: Book = { ...book(me) };
  next[other] = { n: (next[other]?.n ?? 0) + weight, at: Date.now() };
  const ids = Object.keys(next);
  if (ids.length > MAX_TRACKED) {
    ids.sort((a, b) => next[a].n - next[b].n || next[a].at - next[b].at);
    ids.slice(0, ids.length - MAX_TRACKED).forEach((id) => delete next[id]);
  }
  cache.set(me, next);
  try { localStorage.setItem(key(me), JSON.stringify(next)); } catch { /* private mode or full */ }
  listeners.forEach((l) => l());
}

/** Your friends, most interacted first, at most `count`. Friends with no interactions yet fill any spare places. */
export function useClosestFriends(uid: string, friends: Set<string>, notes: Note[], count = 5): string[] {
  const mine = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => book(uid),
  );
  return useMemo(() => {
    const score = new Map<string, Stat>();
    const add = (id: string, n: number, at: number) => {
      if (!friends.has(id)) return;
      const s = score.get(id) ?? { n: 0, at: 0 };
      score.set(id, { n: s.n + n, at: Math.max(s.at, at) });
    };
    Object.entries(mine).forEach(([id, s]) => add(id, s.n, s.at));
    notes.forEach((x) => add(x.actorUid, interactionWeight(x.type), x.createdAt));
    return [...friends]
      .sort((a, b) => (score.get(b)?.n ?? 0) - (score.get(a)?.n ?? 0) || (score.get(b)?.at ?? 0) - (score.get(a)?.at ?? 0) || a.localeCompare(b))
      .slice(0, count);
  }, [mine, friends, notes, count]);
}
