import type { Entry } from "./entries";

/** Weeks run Sunday to Saturday. */
const DAY_MS = 864e5;

const parts = (date: string) => date.split("-").map(Number) as [number, number, number];
/** Local date from YYYY-MM-DD, at noon so daylight-saving changes never move it to another day. */
const toDate = (date: string) => { const [y, m, d] = parts(date); return new Date(y, m - 1, d, 12); };
const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const addDays = (date: string, n: number): string => { const d = toDate(date); d.setDate(d.getDate() + n); return toStr(d); };
/** 0 = Sunday ... 6 = Saturday. */
export const dayOfWeek = (date: string): number => toDate(date).getDay();
/** Every day from `from` to `to`, both included (empty when `to` is before `from`). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 3700; d = addDays(d, 1)) out.push(d);
  return out;
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];
/** "2nd week of November" for the week that starts on this Sunday: the week of the month is counted from the Sunday's date. */
export function weekOfMonthLabel(sunday: string): string {
  const d = toDate(sunday);
  const n = Math.min(5, Math.ceil(d.getDate() / 7));
  return `${ORDINALS[n - 1]} week of ${d.toLocaleDateString("en-US", { month: "long" })}`;
}

/** "Week 2 of November" for the week that starts on this Sunday (counted the same way as weekOfMonthLabel). */
export function weekOfMonthShort(sunday: string): string {
  const d = toDate(sunday);
  return `Week ${Math.min(5, Math.ceil(d.getDate() / 7))} of ${d.toLocaleDateString("en-US", { month: "long" })}`;
}

/** The Sunday of the week this date falls in (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const d = toDate(date);
  d.setDate(d.getDate() - d.getDay());
  return toStr(d);
}

export function weekEnd(date: string): string {
  const d = toDate(weekStart(date));
  d.setDate(d.getDate() + 6);
  return toStr(d);
}

/** "Mar 2 – Mar 8, 2026" (the year is shown once, or twice when the week crosses New Year). */
export function weekRange(date: string): string {
  const a = toDate(weekStart(date)), b = toDate(weekEnd(date));
  const md = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${md(a)}${sameYear ? "" : `, ${a.getFullYear()}`} – ${md(b)}, ${b.getFullYear()}`;
}

/** Week 1 is the week of the earliest entry (the first week of the logbook), so it matches how a logbook is usually counted. */
export function weekNumber(date: string, origin: string): number {
  const diff = Math.round((toDate(weekStart(date)).getTime() - toDate(weekStart(origin)).getTime()) / DAY_MS);
  return Math.floor(diff / 7) + 1;
}

/** Earliest day among the entries, or "" when there are none. */
export const earliestDay = (entries: Pick<Entry, "date">[]): string =>
  entries.reduce((min, e) => (!min || e.date < min ? e.date : min), "");

/* ---------- hours ---------- */

const MINUTES_IN_DAY = 24 * 60;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

/** Minutes between two HH:mm times. Out before in means the shift ran past midnight. 0 when either is missing or they are equal. */
export function spanMinutes(clockIn: string, clockOut: string): number {
  if (!clockIn || !clockOut) return 0;
  const a = toMinutes(clockIn), b = toMinutes(clockOut);
  if (Number.isNaN(a) || Number.isNaN(b) || a === b) return 0;
  return b > a ? b - a : b + MINUTES_IN_DAY - a;
}

/** Hours an entry counts for. Entries without a clock in and out count for nothing. */
export const entryMinutes = (e: Pick<Entry, "clockIn" | "clockOut" | "minutes">): number =>
  typeof e.minutes === "number" ? e.minutes : spanMinutes(e.clockIn ?? "", e.clockOut ?? "");

export const sumMinutes = (entries: Pick<Entry, "clockIn" | "clockOut" | "minutes">[]): number =>
  entries.reduce((n, e) => n + entryMinutes(e), 0);

/** 150 -> "2h 30m", 120 -> "2h", 45 -> "45m", 0 -> "0h". */
export function formatHM(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60), m = total % 60;
  if (h === 0 && m === 0) return "0h";
  return `${h > 0 ? `${h}h` : ""}${h > 0 && m > 0 ? " " : ""}${m > 0 ? `${m}m` : ""}`;
}
