import { useEffect, useState } from "react";
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { useSession } from "./session";

/** Someone is shown as "Active now" (with the green dot) for this long after their last heartbeat. */
export const ACTIVE_WINDOW_MS = 3 * 60 * 1000;
/** Someone who was active within this window shows "Active Xm ago" / "Active Xh ago". */
export const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** How often an open, visible tab refreshes its heartbeat. */
const HEARTBEAT_MS = 90 * 1000;

const presenceRef = (uid: string) => doc(db, "presence", uid);

export type PresenceStatus = "active" | "recent" | "offline";
export type PresenceInfo = {
  status: PresenceStatus;
  /** "Active now", "Active 5m ago", or "" when offline / hidden. */
  label: string;
  lastActive: number | null;
};

const OFFLINE: PresenceInfo = { status: "offline", label: "", lastActive: null };

function formatAgo(ms: number): string {
  const mins = Math.max(1, Math.floor(ms / 60_000));
  if (mins < 60) return `Active ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `Active ${hrs}h ago`;
}

function evaluate(online: boolean, lastActive: number | null, now: number): PresenceInfo {
  if (!lastActive || lastActive <= 0) return OFFLINE;
  const age = Math.max(0, now - lastActive);
  if (online && age < ACTIVE_WINDOW_MS) {
    return { status: "active", label: "Active now", lastActive };
  }
  if (age < RECENT_WINDOW_MS) {
    return { status: "recent", label: formatAgo(age), lastActive };
  }
  return { status: "offline", label: "", lastActive };
}

/** Marks the signed-in user as currently active (best effort). */
export function setOnline(uid: string): Promise<void> {
  return setDoc(presenceRef(uid), { online: true, lastActive: serverTimestamp() }).catch(() => {});
}

/** Marks the signed-in user as away/offline while recording when they were last active (best effort). */
export function setOffline(uid: string): Promise<void> {
  return setDoc(presenceRef(uid), { online: false, lastActive: serverTimestamp() }).catch(() => {});
}

/** Removes the presence document completely (used when Active Status is turned off). */
export function clearPresence(uid: string): Promise<void> {
  return deleteDoc(presenceRef(uid)).catch(() => {});
}

/**
 * Publishes the signed-in user's active status while `enabled` is true.
 * Refreshes every 90s while the tab is visible and online, marks offline when hidden/closed,
 * and deletes the presence document immediately if Active Status is turned off.
 */
export function useActivePresence(uid: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      void clearPresence(uid);
      return;
    }

    const ping = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void setOnline(uid);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") ping();
      else void setOffline(uid);
    };

    const onPageHide = () => {
      void setOffline(uid);
    };

    ping();
    const timer = window.setInterval(ping, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", ping);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", ping);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
    };
  }, [uid, enabled]);
}

/**
 * Live active status for another person.
 * Like Messenger, returns offline when your own Active Status is turned off, or when the chat is blocked/restricted.
 */
export function usePresence(uid: string | undefined): PresenceInfo {
  const s = useSession();
  const allowed =
    !!uid &&
    uid !== s.uid &&
    s.me?.activeStatus !== false &&
    !s.chats.blocked.has(uid) &&
    !s.chats.restricted.has(uid);

  const [raw, setRaw] = useState<{ online: boolean; lastActive: number | null }>({ online: false, lastActive: null });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!allowed || !uid) {
      setRaw({ online: false, lastActive: null });
      return;
    }
    return onSnapshot(
      presenceRef(uid),
      (snap) => {
        if (!snap.exists()) {
          setRaw({ online: false, lastActive: null });
          return;
        }
        const d = snap.data();
        const ts = d.lastActive instanceof Timestamp ? d.lastActive.toMillis() : typeof d.lastActive === "number" ? d.lastActive : null;
        setRaw({ online: d.online === true, lastActive: ts });
        setNow(Date.now());
      },
      () => {
        setRaw({ online: false, lastActive: null });
      },
    );
  }, [allowed, uid]);

  // Re-evaluate every 30s so "Active now" transitions smoothly to "Active 3m ago" even if the other tab closed abruptly.
  useEffect(() => {
    if (!allowed || !raw.lastActive) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [allowed, raw.lastActive]);

  if (!allowed) return OFFLINE;
  return evaluate(raw.online, raw.lastActive, now);
}
