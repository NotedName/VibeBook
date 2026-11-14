import { addDays, dayOfWeek, daysBetween } from "./weeks";

/**
 * Which days you can work. `workDays` is the usual week (0 = Sunday ... 6 = Saturday). `daysOff` are dates that are
 * unavailable although their weekday is usually a work day (a holiday, an absence); `daysOn` are dates that are
 * available although their weekday is usually off (working a Saturday). `hoursPerDay` is a full day's hours.
 */
export type Availability = { workDays: number[]; daysOff: string[]; daysOn: string[]; hoursPerDay: number };

export const DEFAULT_AVAILABILITY: Availability = { workDays: [1, 2, 3, 4, 5], daysOff: [], daysOn: [], hoursPerDay: 8 };
/** Most dates that can be listed as exceptions (firestore.rules allows the same). */
export const MAX_EXCEPTIONS = 400;

const isDate = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

/** Reads what is stored, falling back to the defaults for anything missing or malformed. */
export function normalizeAvailability(raw: Record<string, unknown> | undefined): Availability {
  if (!raw) return DEFAULT_AVAILABILITY;
  const days = Array.isArray(raw.workDays) ? [...new Set(raw.workDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))] : null;
  const hpd = typeof raw.hoursPerDay === "number" && raw.hoursPerDay > 0 && raw.hoursPerDay <= 24 ? raw.hoursPerDay : DEFAULT_AVAILABILITY.hoursPerDay;
  return {
    workDays: days ?? DEFAULT_AVAILABILITY.workDays,
    daysOff: Array.isArray(raw.daysOff) ? raw.daysOff.filter(isDate) : [],
    daysOn: Array.isArray(raw.daysOn) ? raw.daysOn.filter(isDate) : [],
    hoursPerDay: hpd,
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
