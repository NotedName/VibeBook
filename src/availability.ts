import { addDays, dayOfWeek, daysBetween } from "./weeks";

/**
 * Which days you can work. `workDays` is the usual week (0 = Sunday ... 6 = Saturday). `daysOff` are dates that are
 * unavailable although their weekday is usually a work day (a holiday, an absence); `daysOn` are dates that are
 * available although their weekday is usually off (working a Saturday). `hoursPerDay` is a full day's hours.
 */
export type Availability = {
  workDays: number[]; daysOff: string[]; daysOn: string[];
  /** paid hours in a full day: start to end, less the break. This is what every calculation uses. */
  hoursPerDay: number;
  /** how that day is made up, "HH:MM", so the schedule sheet can show it again */
  startTime?: string; endTime?: string; breakMinutes?: number;
  /** when the break starts, "HH:MM". With breakMinutes it is the planned break: taken out of the shift automatically (see hours.ts) */
  breakAt?: string;
};

/** The planned break of a day: when it starts and how long it lasts. */
export type BreakPlan = { at: string; minutes: number };
export const planOf = (a: Availability): BreakPlan | null => (a.breakAt && a.breakMinutes && a.breakMinutes > 0 ? { at: a.breakAt, minutes: a.breakMinutes } : null);

export const DEFAULT_AVAILABILITY: Availability = { workDays: [1, 2, 3, 4, 5], daysOff: [], daysOn: [], hoursPerDay: 8 };

const isDate = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

const pad = (n: number) => String(n).padStart(2, "0");
export const isTime = (x: unknown): x is string => typeof x === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
export const toMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const toTime = (n: number) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;

/** Minutes in a full day: from start to end, less the break. 0 when the times are missing, not in order, or the break takes the whole day. */
export function shiftMinutes(start: string, end: string, breakMinutes: number): number {
  if (!isTime(start) || !isTime(end)) return 0;
  return Math.max(0, toMinutes(end) - toMinutes(start) - breakMinutes);
}

/** Start, end and break to show for someone who only ever saved hours per day: an 08:00 start and no break, ending when the hours are done. */
export function defaultTimes(hoursPerDay: number): { startTime: string; endTime: string; breakMinutes: number } {
  const total = Math.round(hoursPerDay * 60);
  const start = total <= 16 * 60 ? 8 * 60 : 0;
  return { startTime: toTime(start), endTime: toTime(Math.min(start + total, 24 * 60 - 1)), breakMinutes: 0 };
}

/** Reads what is stored, falling back to the defaults for anything missing or malformed. */
export function normalizeAvailability(raw: Record<string, unknown> | undefined): Availability {
  if (!raw) return DEFAULT_AVAILABILITY;
  const days = Array.isArray(raw.workDays) ? [...new Set(raw.workDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))] : null;
  const hpd = typeof raw.hoursPerDay === "number" && raw.hoursPerDay > 0 && raw.hoursPerDay <= 24 ? raw.hoursPerDay : DEFAULT_AVAILABILITY.hoursPerDay;
  const timed = isTime(raw.startTime) && isTime(raw.endTime) && typeof raw.breakMinutes === "number" && raw.breakMinutes >= 0 && raw.breakMinutes <= 1440;
  return {
    workDays: days ?? DEFAULT_AVAILABILITY.workDays,
    daysOff: Array.isArray(raw.daysOff) ? raw.daysOff.filter(isDate) : [],
    daysOn: Array.isArray(raw.daysOn) ? raw.daysOn.filter(isDate) : [],
    hoursPerDay: hpd,
    ...(timed ? { startTime: raw.startTime as string, endTime: raw.endTime as string, breakMinutes: raw.breakMinutes as number } : {}),
    ...(timed && isTime(raw.breakAt) ? { breakAt: raw.breakAt } : {}),
  };
}

export function isAvailable(date: string, a: Availability): boolean {
  if (a.daysOff.includes(date)) return false;
  if (a.daysOn.includes(date)) return true;
  return a.workDays.includes(dayOfWeek(date));
}

/** How many days from `from` to `to` (both included) are available. */
export const availableDaysIn = (from: string, to: string, a: Availability): number =>
  daysBetween(from, to).filter((d) => isAvailable(d, a)).length;

/** Flips one date: available becomes unavailable and the other way round, keeping the lists to real exceptions only. */
export function toggleDate(date: string, a: Availability): Availability {
  const usual = a.workDays.includes(dayOfWeek(date));
  const without = (list: string[]) => list.filter((d) => d !== date);
  if (isAvailable(date, a)) {
    return usual ? { ...a, daysOff: [...a.daysOff, date], daysOn: without(a.daysOn) } : { ...a, daysOn: without(a.daysOn), daysOff: without(a.daysOff) };
  }
  return usual ? { ...a, daysOff: without(a.daysOff), daysOn: without(a.daysOn) } : { ...a, daysOn: [...a.daysOn, date], daysOff: without(a.daysOff) };
}

/** Drops exceptions that the usual week already covers (after the usual days changed), de-duplicated and sorted. */
export function cleanExceptions(a: Availability): Availability {
  const usual = new Set(a.workDays);
  return {
    ...a,
    workDays: [...usual].sort((x, y) => x - y),
    daysOff: [...new Set(a.daysOff)].filter((d) => usual.has(dayOfWeek(d))).sort(),
    daysOn: [...new Set(a.daysOn)].filter((d) => !usual.has(dayOfWeek(d))).sort(),
  };
}

export type Projection = { availableDays: number; finishDate: string } | "done" | null;

/**
 * When the required hours will be reached if you work a full day on every available day. Today counts only for what is
 * left of its hours. null when no day is ever available; "done" when nothing is left.
 */
export function projectFinish(remainingMinutes: number, today: string, todayMinutes: number, a: Availability): Projection {
  if (remainingMinutes <= 0) return "done";
  const perDay = a.hoursPerDay * 60;
  let left = remainingMinutes;
  if (isAvailable(today, a)) {
    left -= Math.max(0, perDay - todayMinutes);
    if (left <= 0) return { availableDays: 0, finishDate: today };
  }
  let days = 0;
  let date = today;
  for (let i = 0; i < 1100; i++) {
    date = addDays(date, 1);
    if (!isAvailable(date, a)) continue;
    days++;
    left -= perDay;
    if (left <= 0) return { availableDays: days, finishDate: date };
  }
  return null;
}

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon to Fri", "Mon to Wed, Sat": runs of days in the order the logbook uses (Sunday first). */
export function describeDays(days: number[]): string {
  const order = [0, 1, 2, 3, 4, 5, 6].filter((d) => days.includes(d));
  const runs: number[][] = [];
  for (const d of order) {
    const last = runs[runs.length - 1];
    if (last && (last[last.length - 1] + 1) % 7 === d && d !== 0) last.push(d); else runs.push([d]);
  }
  return runs.map((r) => (r.length > 2 ? `${NAMES[r[0]]} to ${NAMES[r[r.length - 1]]}` : r.map((d) => NAMES[d]).join(", "))).join(", ");
}
