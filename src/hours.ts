import { useEffect, useState } from "react";
import { deleteDoc, deleteField, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { nowStr, todayStr } from "./report";
import { cleanExceptions, DEFAULT_AVAILABILITY, MAX_EXCEPTIONS, normalizeAvailability, type Availability } from "./availability";
import { EMPTY_DETAILS, type ReportDetails } from "./reportDocs";

/**
 * Small private documents under users/{uid}/hours, so they follow you to every device:
 *  - goal:   { requiredHours, workDays, daysOff, daysOn, hoursPerDay }  the hours your school or company requires (the
 *            target of the progress bar) and which days you can work (see availability.ts);
 *  - clock:  { date, time }     the moment you clocked in, present only while the clock is running;
 *  - shared: { minutes, requiredMinutes? }  a summary other people can read, only while hoursVisible is on in your profile
 *            (Settings > Privacy). Kept in step with your entries by HoursCard; deleted when you turn the setting off;
 *  - report: the names and school lines printed at the top of exported reports (see reportDocs.ts).
 * Hours worked themselves live on the entries (clockIn, clockOut, minutes).
 */
export const MAX_REQUIRED_HOURS = 10000;

const goalRef = (uid: string) => doc(db, "users", uid, "hours", "goal");
const clockRef = (uid: string) => doc(db, "users", uid, "hours", "clock");
const reportRef = (uid: string) => doc(db, "users", uid, "hours", "report");

export type SharedHours = { minutes: number; requiredMinutes: number | null };

/** What someone has chosen to show of their hours. null: nothing shared (hidden, or not saved yet); undefined while loading. */
export function useSharedHours(uid: string, enabled: boolean): SharedHours | null | undefined {
  const [state, setState] = useState<SharedHours | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) { setState(null); return; }
    setState(undefined);
    return onSnapshot(
      doc(db, "users", uid, "hours", "shared"),
      (snap) => {
        const d = snap.data();
        setState(snap.exists() && typeof d?.minutes === "number"
          ? { minutes: d.minutes, requiredMinutes: typeof d.requiredMinutes === "number" && d.requiredMinutes > 0 ? d.requiredMinutes : null }
          : null);
      },
      () => setState(null),
    );
  }, [uid, enabled]);
  return state;
}

/** Saves the summary other people see: the minutes logged so far and the minutes required (null when no goal is set). */
export const publishHours = (uid: string, minutes: number, requiredMinutes: number | null) =>
  setDoc(doc(db, "users", uid, "hours", "shared"),
    requiredMinutes ? { minutes: Math.max(0, Math.round(minutes)), requiredMinutes: Math.round(requiredMinutes) } : { minutes: Math.max(0, Math.round(minutes)) });

export type HoursGoal = { hours: number | null; availability: Availability; ready: boolean };

/** The hours required (null when none is set) and the days you can work. `ready` is false until the first answer. */
export function useHoursGoal(uid: string): HoursGoal {
  const [state, setState] = useState<HoursGoal>({ hours: null, availability: DEFAULT_AVAILABILITY, ready: false });
  useEffect(() => onSnapshot(
    goalRef(uid),
    (snap) => {
      const d = snap.data();
      const h = d?.requiredHours;
      setState({ hours: typeof h === "number" && h > 0 ? h : null, availability: normalizeAvailability(d), ready: true });
    },
    () => setState({ hours: null, availability: DEFAULT_AVAILABILITY, ready: true }),
  ), [uid]);
  return state;
}

/** Sets the required hours; 0 or empty removes the goal (the days you can work are kept). */
export async function setRequiredHours(uid: string, hours: number): Promise<void> {
  if (!Number.isFinite(hours) || hours <= 0) { await setDoc(goalRef(uid), { requiredHours: deleteField() }, { merge: true }); return; }
  if (hours > MAX_REQUIRED_HOURS) throw new Error(`The most you can set is ${MAX_REQUIRED_HOURS} hours.`);
  await setDoc(goalRef(uid), { requiredHours: Math.round(hours * 100) / 100 }, { merge: true });
}

/** Saves which days are available. Exceptions the usual week already covers are dropped first. */
export async function saveAvailability(uid: string, value: Availability): Promise<void> {
  const a = cleanExceptions(value);
  if (a.daysOff.length > MAX_EXCEPTIONS || a.daysOn.length > MAX_EXCEPTIONS) throw new Error(`At most ${MAX_EXCEPTIONS} dates can be changed. Clear some old ones first.`);
  if (!(a.hoursPerDay > 0 && a.hoursPerDay <= 24)) throw new Error("Hours per day must be between 0 and 24.");
  await setDoc(goalRef(uid), { workDays: a.workDays, daysOff: a.daysOff, daysOn: a.daysOn, hoursPerDay: Math.round(a.hoursPerDay * 100) / 100 }, { merge: true });
}

/** What is printed at the top of exported reports; null until loaded. */
export function useReportDetails(uid: string): ReportDetails | null {
  const [details, setDetails] = useState<ReportDetails | null>(null);
  useEffect(() => onSnapshot(
    reportRef(uid),
    (snap) => {
      const d = snap.data() ?? {};
      const pick = (k: keyof ReportDetails) => (typeof d[k] === "string" ? (d[k] as string) : "");
      setDetails(Object.fromEntries(Object.keys(EMPTY_DETAILS).map((k) => [k, pick(k as keyof ReportDetails)])) as ReportDetails);
    },
    () => setDetails({ ...EMPTY_DETAILS }),
  ), [uid]);
  return details;
}

export const saveReportDetails = (uid: string, d: ReportDetails) =>
  setDoc(reportRef(uid), Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim().slice(0, 120)])));

export type RunningClock = { date: string; time: string };

/** The running clock, null when clocked out, undefined until the first answer. */
export function useRunningClock(uid: string): RunningClock | null | undefined {
  const [clock, setClock] = useState<RunningClock | null | undefined>(undefined);
  useEffect(() => onSnapshot(
    clockRef(uid),
    (snap) => {
      const d = snap.data();
      setClock(snap.exists() && typeof d?.date === "string" && typeof d?.time === "string" ? { date: d.date, time: d.time } : null);
    },
    () => setClock(null),
  ), [uid]);
  return clock;
}

export const clockIn = (uid: string) => setDoc(clockRef(uid), { date: todayStr(), time: nowStr() });
/** Fixes the start time of the running clock (and its date, when the shift started on another day). */
export const editClockStart = (uid: string, date: string, time: string) => setDoc(clockRef(uid), { date, time });
/** Stops the clock without logging anything. */
export const discardClock = (uid: string) => deleteDoc(clockRef(uid));

/** Minutes the clock has been running (0 if the start is in the future or unreadable). */
export function runningMinutes(c: RunningClock, now = Date.now()): number {
  const t = new Date(`${c.date}T${c.time}`).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 60000));
}
