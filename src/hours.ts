import { useEffect, useState } from "react";
import { deleteDoc, deleteField, doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { nowStr, todayStr } from "./report";
import { cleanExceptions, DEFAULT_AVAILABILITY, normalizeAvailability, type Availability, type BreakPlan } from "./availability";
import { EMPTY_DETAILS, type ReportDetails } from "./reportDocs";

/**
 * Small private documents under users/{uid}/hours, so they follow you to every device:
 *  - goal:   { requiredHours, workDays, daysOff, daysOn, hoursPerDay, startTime, endTime, breakMinutes, breakAt }  the hours your school or company requires (the
 *            target of the progress bar) and which days you can work (see availability.ts);
 *  - clock:  { date, time, breakMs, breakStart?, breakPlanned?, planUsed? }  the moment you clocked in, present only while the clock is running. breakMs is the
 *            break time already taken; breakStart (epoch ms) is present only while a break is running; breakPlanned: that break ends by itself
 *            after the planned length; planUsed: the planned break has been taken (or skipped), so its time slot is not taken out again;
 *  - shared: { minutes, requiredMinutes? }  a summary the people in your hoursAudience can read (Settings > Privacy). Kept in
 *            step with your entries by HoursCard; deleted when you choose only me;
 *  - status: { since, onBreak, breakEndsAt? }  present only while the clock is running, for the people in your statusAudience (Settings > Privacy): when you clocked in, whether you are on a break and when it ends. Kept in step by HoursCard; deleted when you clock out or choose only me;
 *  - schedule: { workDays, hoursPerDay, daysOff, daysOn, startTime, endTime, breakMinutes, breakAt }  the usual week and single dates the people in your scheduleAudience can read. Kept in step by
 *            saveAvailability; deleted when you choose only me;
 *  - report: the names and school lines printed at the top of exported reports (see reportDocs.ts).
 * Hours worked themselves live on the entries (clockIn, clockOut, minutes).
 */
export const MAX_REQUIRED_HOURS = 10000;

const goalRef = (uid: string) => doc(db, "users", uid, "hours", "goal");
const clockRef = (uid: string) => doc(db, "users", uid, "hours", "clock");
const reportRef = (uid: string) => doc(db, "users", uid, "hours", "report");

const scheduleRef = (uid: string) => doc(db, "users", uid, "hours", "schedule");

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

/** Whether someone is clocked in right now: `since` is when the clock started (epoch ms). On a break, `breakEndsAt` is when they resume (null: not known). */
export type SharedStatus = { since: number; onBreak: boolean; breakEndsAt: number | null };
const statusRef = (uid: string) => doc(db, "users", uid, "hours", "status");

/** Whether someone (in your status audience) is clocked in. null: not clocked in or not shared; undefined while loading. */
export function useSharedStatus(uid: string, enabled: boolean): SharedStatus | null | undefined {
  const [state, setState] = useState<SharedStatus | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) { setState(null); return; }
    setState(undefined);
    return onSnapshot(
      statusRef(uid),
      (snap) => {
        const d = snap.data();
        setState(snap.exists() && typeof d?.since === "number"
          ? { since: d.since, onBreak: d.onBreak === true, breakEndsAt: typeof d.breakEndsAt === "number" ? d.breakEndsAt : null }
          : null);
      },
      () => setState(null),
    );
  }, [uid, enabled]);
  return state;
}

/** Saves what your status audience sees while the clock runs. */
export const publishStatus = (uid: string, s: SharedStatus) =>
  setDoc(statusRef(uid), { since: s.since, onBreak: s.onBreak, ...(s.onBreak && s.breakEndsAt !== null ? { breakEndsAt: s.breakEndsAt } : {}) });
/** Removes it (clocked out, or no longer shared). */
export const clearStatus = (uid: string) => deleteDoc(statusRef(uid));

/** What people in your schedule audience can read: the usual week, the single dates that differ from it, and the daily times. */
export type SharedSchedule = Availability;

/** The usual week someone has chosen to show. null: nothing shared; undefined while loading. */
export function useSharedSchedule(uid: string, enabled: boolean): SharedSchedule | null | undefined {
  const [state, setState] = useState<SharedSchedule | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) { setState(null); return; }
    setState(undefined);
    return onSnapshot(
      scheduleRef(uid),
      (snap) => {
        const a = normalizeAvailability(snap.data());
        setState(snap.exists() ? a : null);
      },
      () => setState(null),
    );
  }, [uid, enabled]);
  return state;
}

export const publishSchedule = (uid: string, a: Availability) =>
  setDoc(scheduleRef(uid), {
    workDays: a.workDays, hoursPerDay: a.hoursPerDay, daysOff: a.daysOff, daysOn: a.daysOn,
    ...(a.startTime && a.endTime && a.breakMinutes !== undefined ? { startTime: a.startTime, endTime: a.endTime, breakMinutes: a.breakMinutes } : {}),
    ...(a.breakAt ? { breakAt: a.breakAt } : {}),
  });

/** Copies your saved days to the shared schedule, or deletes it when `audience` is only me. */
export async function syncSchedule(uid: string, share: boolean): Promise<void> {
  if (!share) { await deleteDoc(scheduleRef(uid)); return; }
  await publishSchedule(uid, normalizeAvailability((await getDoc(goalRef(uid))).data()));
}

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

/** Saves which days are available. Exceptions the usual week already covers are dropped first. `share`: also update the shared schedule. */
export async function saveAvailability(uid: string, value: Availability, share: boolean): Promise<void> {
  const a = cleanExceptions(value);
  if (!(a.hoursPerDay > 0 && a.hoursPerDay <= 24)) throw new Error("Hours per day must be between 0 and 24.");
  const times = a.startTime && a.endTime && a.breakMinutes !== undefined ? { startTime: a.startTime, endTime: a.endTime, breakMinutes: a.breakMinutes } : {};
  await setDoc(goalRef(uid), { workDays: a.workDays, daysOff: a.daysOff, daysOn: a.daysOn, holidays: a.holidays ?? [], hoursPerDay: Math.round(a.hoursPerDay * 100) / 100, ...times, breakAt: a.breakAt ?? deleteField() }, { merge: true });
  if (share) await publishSchedule(uid, a);
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

/** Forgets the remembered report details on every device. */
export const clearReportDetails = (uid: string) => deleteDoc(reportRef(uid));

/**
 * `edited`: the start was changed after clocking in; `origDate` and `origTime` are when the clock really started.
 * `breakMs`: break time already taken. `breakStart`: when the running break began (epoch ms), absent when not on a break.
 */
export type RunningClock = { date: string; time: string; breakMs: number; breakStart?: number; breakPlanned?: boolean; planUsed?: boolean; edited?: boolean; origDate?: string; origTime?: string };

/** The running clock, null when clocked out, undefined until the first answer. */
export function useRunningClock(uid: string): RunningClock | null | undefined {
  const [clock, setClock] = useState<RunningClock | null | undefined>(undefined);
  useEffect(() => onSnapshot(
    clockRef(uid),
    (snap) => {
      const d = snap.data();
      const ok = snap.exists() && typeof d?.date === "string" && typeof d?.time === "string";
      const edited = ok && d?.edited === true && typeof d?.origDate === "string" && typeof d?.origTime === "string";
      if (!ok) { setClock(null); return; }
      const brk = {
        breakMs: typeof d!.breakMs === "number" ? d!.breakMs : 0,
        ...(typeof d!.breakStart === "number" ? { breakStart: d!.breakStart } : {}),
        ...(d!.breakPlanned === true ? { breakPlanned: true } : {}), ...(d!.planUsed === true ? { planUsed: true } : {}),
      };
      setClock(edited ? { date: d!.date, time: d!.time, ...brk, edited: true, origDate: d!.origDate, origTime: d!.origTime } : { date: d!.date, time: d!.time, ...brk });
    },
    () => setClock(null),
  ), [uid]);
  return clock;
}

export const clockIn = (uid: string) => setDoc(clockRef(uid), { date: todayStr(), time: nowStr(), breakMs: 0 });
/** Fixes the start time of the running clock (and its date, when the shift started on another day). Break time is kept. */
export function editClockStart(uid: string, date: string, time: string, current: RunningClock) {
  const origDate = current.origDate ?? current.date, origTime = current.origTime ?? current.time;
  const brk = {
    breakMs: current.breakMs, ...(current.breakStart !== undefined ? { breakStart: current.breakStart } : {}),
    ...(current.breakPlanned ? { breakPlanned: true } : {}), ...(current.planUsed ? { planUsed: true } : {}),
  };
  // Setting it back to the real start clears the "edited" mark.
  if (date === origDate && time === origTime) return setDoc(clockRef(uid), { date, time, ...brk });
  return setDoc(clockRef(uid), { date, time, ...brk, edited: true, origDate, origTime });
}

const MIN = 60000;
const startOf = (c: RunningClock) => new Date(`${c.date}T${c.time}`).getTime();
/** The planned break as a time slot on the day the shift started. */
function windowOf(c: RunningClock, plan: BreakPlan | null | undefined): { start: number; end: number } | null {
  if (!plan) return null;
  const start = new Date(`${c.date}T${plan.at}`).getTime();
  return Number.isNaN(start) ? null : { start, end: start + plan.minutes * MIN };
}
/** How much of the planned slot has passed while clocked in (a slot that began before you clocked in only counts from the moment you did). */
function slotMs(c: RunningClock, now: number, plan: BreakPlan | null | undefined): number {
  const w = windowOf(c, plan), st = startOf(c);
  return !w || Number.isNaN(st) ? 0 : Math.max(0, Math.min(now, w.end) - Math.max(w.start, st));
}
/** Time of the break the person started with the button: all of it, or at most the planned length when it was started early. */
function manualMs(c: RunningClock, now: number, plan: BreakPlan | null | undefined): number {
  if (c.breakStart === undefined) return 0;
  const run = Math.max(0, now - c.breakStart);
  return c.breakPlanned && plan ? Math.min(run, plan.minutes * MIN) : run;
}

/**
 * Break time taken so far in milliseconds: breaks started with the button, plus the planned break (see BreakPlan), which is taken out by
 * itself as its time slot passes unless it was already used by starting the break early.
 */
const breakMsAt = (c: RunningClock, now: number, plan?: BreakPlan | null) =>
  c.breakMs + manualMs(c, now, plan) + (c.planUsed ? 0 : slotMs(c, now, plan));

/** Whether the clock is paused for a break right now: one started with the button that has not finished, or the planned slot. */
export function isOnBreak(c: RunningClock, now: number, plan?: BreakPlan | null): boolean {
  if (c.breakStart !== undefined && !(c.breakPlanned && plan && now - c.breakStart >= plan.minutes * MIN)) return true;
  const w = windowOf(c, plan), st = startOf(c);
  return !c.planUsed && !!w && !Number.isNaN(st) && now >= Math.max(w.start, st) && now < w.end;
}
/** When the running break ends by itself (epoch ms), null when it lasts until Resume is pressed. */
export function breakEndsAt(c: RunningClock, now: number, plan?: BreakPlan | null): number | null {
  if (c.breakStart !== undefined) return c.breakPlanned && plan ? c.breakStart + plan.minutes * MIN : null;
  return windowOf(c, plan)?.end ?? null;
}
/** The planned break is still ahead and has not been used: it will start at this time (epoch ms). */
export function breakComesAt(c: RunningClock, now: number, plan?: BreakPlan | null): number | null {
  const w = windowOf(c, plan);
  return w && !c.planUsed && now < w.start ? w.start : null;
}

/**
 * Pauses the clock: time on a break is not counted. Started before the planned break, it uses the planned break (its length, then it ends by
 * itself) and the planned slot is not taken out again. Anything else is an extra break that lasts until Resume.
 */
export function startBreak(uid: string, c: RunningClock, plan?: BreakPlan | null, now = Date.now()) {
  const w = windowOf(c, plan);
  const early = !!plan && !c.planUsed && !!w && now < w.start;
  return updateDoc(clockRef(uid), {
    breakMs: c.breakMs + manualMs(c, now, plan), // a planned break that already ran its course is added before a new one starts
    breakStart: now,
    breakPlanned: early ? true : deleteField(),
    ...(early ? { planUsed: true } : {}),
  });
}
/** Ends the running break and adds the time taken to the break time. During the planned slot, this ends it early and only the time so far counts. */
export function endBreak(uid: string, c: RunningClock, plan?: BreakPlan | null, now = Date.now()) {
  if (c.breakStart !== undefined) {
    return updateDoc(clockRef(uid), { breakMs: c.breakMs + manualMs(c, now, plan), breakStart: deleteField(), breakPlanned: deleteField() });
  }
  return updateDoc(clockRef(uid), { breakMs: c.breakMs + slotMs(c, now, plan), planUsed: true });
}

/** Whole minutes of break taken, counting a break that is still running. */
export const breakMinutesOf = (c: RunningClock, now = Date.now(), plan?: BreakPlan | null) => Math.floor(breakMsAt(c, now, plan) / MIN);
/** Stops the clock without logging anything. */
export const discardClock = (uid: string) => deleteDoc(clockRef(uid));

/** Minutes worked so far, break time left out (0 if the start is in the future or unreadable). */
export function runningMinutes(c: RunningClock, now = Date.now(), plan?: BreakPlan | null): number {
  const t = startOf(c);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t - breakMsAt(c, now, plan)) / MIN));
}
