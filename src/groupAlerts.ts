import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { nowStr, todayStr } from "./report";
import { usePreferences } from "./preferences";

/**
 * "New posts in your groups" alerts for the bell. Nothing is written for them: each group you have alerts on is followed
 * while the app is open, and a post counts as new when it is by someone else and stamped after you last looked at that
 * group (the group's page, or the bell). "Last looked" is kept on this device. A group seen for the first time starts
 * from now, so joining does not bring a wall of old posts.
 */
export type GroupAlert = { gid: string; count: number };

const seenKey = (uid: string) => `vibebook-group-seen-${uid}`;
const stamp = () => `${todayStr()} ${nowStr()}`;

function loadSeen(uid: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(seenKey(uid)) ?? "{}") as Record<string, string>; } catch { return {}; }
}

export function useGroupAlerts(uid: string, groupIds: string[]) {
  const prefs = usePreferences();
  const [seen, setSeen] = useState(() => loadSeen(uid));
  // stamps ("YYYY-MM-DD HH:mm") of other people's recent posts, per group
  const [posts, setPosts] = useState<Record<string, string[]>>({});

  const postsRef = useRef(posts);
  postsRef.current = posts;

  // "Seen" is now, or the newest post already known if that is stamped later (a post dated ahead of this
  // device's clock would otherwise stay "new" however often you marked it read).
  const markSeen = useCallback((gid: string) => {
    const newest = (postsRef.current[gid] ?? []).reduce((a, b) => (b > a ? b : a), "");
    const now = stamp();
    setSeen((prev) => {
      const next = { ...prev, [gid]: newest > now ? newest : now };
      try { localStorage.setItem(seenKey(uid), JSON.stringify(next)); } catch { /* not remembered */ }
      return next;
    });
  }, [uid]);

  // A group you have never looked at starts counting from now.
  const idsKey = groupIds.join(",");
  useEffect(() => {
    const fresh = groupIds.filter((g) => !(g in seen));
    if (fresh.length) fresh.forEach(markSeen);
    // seen is only read to find groups without an entry; markSeen adds them
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const watched = useMemo(
    () => (prefs.groupPosts ? groupIds.filter((g) => !prefs.mutedGroups.includes(g)) : []),
    [prefs.groupPosts, prefs.mutedGroups, groupIds],
  );
  const watchedKey = watched.join(",");

  useEffect(() => {
    const stops = watched.map((gid) => onSnapshot(
      query(collection(db, "groups", gid, "posts"), orderBy("date", "desc"), limit(20)),
      (snap) => {
        const others = snap.docs.flatMap((d) => {
          const p = d.data() as { ownerUid: string; repostedBy?: string; date?: string; time?: string };
          return p.ownerUid !== uid && p.repostedBy !== uid ? [`${p.date} ${p.time}`] : [];
        });
        setPosts((prev) => ({ ...prev, [gid]: others }));
      },
      () => {},
    ));
    return () => stops.forEach((stop) => stop());
    // watchedKey stands for watched
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedKey, uid]);

  const alerts = useMemo<GroupAlert[]>(
    () => watched.flatMap((gid) => {
      const since = seen[gid];
      const count = since ? (posts[gid] ?? []).filter((t) => t > since).length : 0;
      return count > 0 ? [{ gid, count }] : [];
    }),
    [watched, posts, seen],
  );
  return { alerts, markSeen };
}
