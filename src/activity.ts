import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Your activity log: a short record of what you did in VibeBook (entries, comments, reactions, reposts, friends, groups).
 * Every action is saved to your account (users/{uid}/activity), so the same log shows on every device you sign in on.
 * A copy is also kept on this device so logging is instant and works offline. The log is append-only: nothing in the app
 * (and nothing in firestore.rules) can change or delete it. Logging never throws or blocks an action.
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

/** Only a safety cap on storage on this device, far above what anyone does. */
const MAX = 2000;
/** How many of the newest items are read from your account (and shown) at once, and uploaded when a device first syncs. */
export const ACTIVITY_SHOWN = 500;
const key = (uid: string) => `vibebook-activity-${uid}`;
const syncedKey = (uid: string) => `vibebook-activity-synced-${uid}`;
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

/** The stored shape: no empty fields, and short enough for firestore.rules. */
const toDoc = (a: Activity) => ({
  at: a.at,
  text: a.text.slice(0, 300),
  ...(a.who ? { who: a.who } : {}),
  ...(a.href ? { href: a.href.slice(0, 200) } : {}),
});

export function logActivity(uid: string, text: string, extra: Pick<Activity, "who" | "href"> = {}) {
  const item: Activity = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), text, ...extra };
  save(uid, [item, ...items(uid)].slice(0, MAX));
  // Best effort: if this fails the local copy stays and syncActivity uploads it the next time the app opens.
  setDoc(doc(db, "users", uid, "activity", item.id), toDoc(item)).catch(() => {});
}

/**
 * Uploads what this device logged since it last synced (the first time: its newest 500), so an existing log shows on
 * your other devices too. Writing an item that is already there is allowed when nothing in it changes.
 */
export async function syncActivity(uid: string): Promise<void> {
  let since = 0;
  try { since = Number(localStorage.getItem(syncedKey(uid))) || 0; } catch { /* treated as never synced */ }
  const local = items(uid);
  const todo = local.filter((a) => a.at > since).slice(0, ACTIVITY_SHOWN);
  for (let i = 0; i < todo.length; i += 400) {
    const batch = writeBatch(db);
    todo.slice(i, i + 400).forEach((a) => batch.set(doc(db, "users", uid, "activity", a.id), toDoc(a)));
    await batch.commit();
  }
  const newest = local.reduce((m, a) => Math.max(m, a.at), since);
  try { localStorage.setItem(syncedKey(uid), String(newest)); } catch { /* will just repeat next time */ }
}

/** Newest first: your account's log merged with this device's copy. */
export function useActivity(uid: string): Activity[] {
  return useActivityState(uid).items;
}

/** Same as useActivity, plus `ready`: false until the account's log has been read for the first time. */
export function useActivityState(uid: string): { items: Activity[]; ready: boolean } {
  const local = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => items(uid),
  );
  const [cloud, setCloud] = useState<Activity[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCloud([]);
    setReady(false);
    return onSnapshot(
      query(collection(db, "users", uid, "activity"), orderBy("at", "desc"), limit(ACTIVITY_SHOWN)),
      (snap) => { setCloud(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Activity)); setReady(true); },
      () => { setReady(true); /* offline or not allowed: the copy on this device is still shown */ },
    );
  }, [uid]);

  const mergedItems = useMemo(() => {
    // When the account has more than we read, older items from this device are left out so every device shows the same list.
    const cutoff = cloud.length >= ACTIVITY_SHOWN ? cloud[cloud.length - 1].at : 0;
    const byId = new Map<string, Activity>();
    [...local, ...cloud].forEach((a) => { if (a.at >= cutoff) byId.set(a.id, a); });
    return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, ACTIVITY_SHOWN);
  }, [local, cloud]);
  return { items: mergedItems, ready };
}