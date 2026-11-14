import { useSyncExternalStore } from "react";

/**
 * Your activity log: a short record of what you did in VibeBook (entries, comments, reactions, reposts, friends, groups).
 * It is kept on this device only, per account, and is append-only: nothing in the app can delete or clear it. Logging never throws or blocks an action.
 */
export type Activity = {
  id: string;
  at: number;
  text: string;
  /** another person involved, shown by name after the text */
  who?: string;
  /** where tapping the item goes */
  href?: string;
};

/** Only a safety cap on storage, far above what anyone does; there is no way to clear the log. */
const MAX = 2000;
const key = (uid: string) => `vibebook-activity-${uid}`;
const cache = new Map<string, Activity[]>();
const listeners = new Set<() => void>();

function load(uid: string): Activity[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(uid)) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
function items(uid: string): Activity[] {
  let list = cache.get(uid);
  if (!list) { list = load(uid); cache.set(uid, list); }
  return list;
}
function save(uid: string, list: Activity[]) {
  cache.set(uid, list);
  try { localStorage.setItem(key(uid), JSON.stringify(list)); } catch { /* private mode or full */ }
  listeners.forEach((l) => l());
}

export function logActivity(uid: string, text: string, extra: Pick<Activity, "who" | "href"> = {}) {
  const item: Activity = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), text, ...extra };
  save(uid, [item, ...items(uid)].slice(0, MAX));
}

/** Newest first. */
export function useActivity(uid: string): Activity[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => items(uid),
  );
}
