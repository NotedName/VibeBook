import { useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { usePreferences } from "./preferences";
import { todayStr } from "./report";

/**
 * "Remind me to log my work" (Settings > Preferences > Notifications): once a day at the chosen time, a notification with the app's
 * picture. It is skipped when you already wrote an entry today. Browsers can only deliver it while VibeBook is open (or installed and
 * running); a reminder that arrives when the app is closed needs push notifications from a server, which this app does not have.
 */
const nextRun = (hhmm: string, from = new Date()): number => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = new Date(from);
  t.setHours(h, m, 0, 0);
  if (t.getTime() <= from.getTime()) t.setDate(t.getDate() + 1);
  return t.getTime();
};

export const canNotify = () => typeof Notification !== "undefined";

/** Asks the browser for permission (must be called from a tap). Resolves to whether reminders can be shown. */
export async function allowReminders(): Promise<boolean> {
  if (!canNotify()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

async function loggedToday(uid: string): Promise<boolean> {
  try {
    const snap = await getDocs(query(collection(db, "users", uid, "entries"), where("date", "==", todayStr())));
    return snap.docs.some((d) => d.data().hoursOnly !== true && d.data().archived !== true);
  } catch { return false; }
}

export function useLogReminder(uid: string, notify: (message: string) => void): void {
  const { reminderOn, reminderTime } = usePreferences();
  useEffect(() => {
    if (!reminderOn) return;
    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(async () => {
        if (!(await loggedToday(uid))) {
          const body = "Take a minute to log what you did today. Add a photo to remember it by.";
          if (canNotify() && Notification.permission === "granted") {
            new Notification("Time to log your work", { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: "vibebook-log-reminder", ...({ image: "/icon-512.png" } as object) });
          } else notify("Time to log your work. Add today's entry and a photo.");
        }
        arm();
      }, Math.min(nextRun(reminderTime) - Date.now(), 2 ** 31 - 1));
    };
    arm();
    return () => window.clearTimeout(timer);
  }, [reminderOn, reminderTime, uid, notify]);
}
