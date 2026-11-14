import type { Entry } from "./entries";
import { firstChar } from "./text";
import { earliestDay, entryMinutes, formatHM, sumMinutes, weekEnd, weekNumber, weekRange, weekStart } from "./weeks";

export const todayStr = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
export const nowStr = () => new Date().toTimeString().slice(0, 5); // HH:mm, local time

export function longDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

export function clockTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (firstChar(parts[0]) + (parts.length > 1 ? firstChar(parts[parts.length - 1]) : "")).toUpperCase();
}

const byTime = (a: Entry, b: Entry) => (a.date + a.time).localeCompare(b.date + b.time);

/** "9:00 AM – 5:00 PM, 8h" for an entry with hours, otherwise just when it was logged. */
export function entryWhen(e: Entry): string {
  const m = entryMinutes(e);
  return e.clockIn && e.clockOut && m > 0
    ? `${clockTime(e.clockIn)} – ${clockTime(e.clockOut)}, ${formatHM(m)}`
    : clockTime(e.time);
}

/** Numbered entries of one day, oldest first, as lines of text. */
function dayLines(list: Entry[]): string[] {
  const out: string[] = [];
  list.forEach((e, i) => {
    out.push(`${i + 1}. ${e.title} (${entryWhen(e)})`);
    if (e.skills.length) out.push(`   Skills acquired: ${e.skills.join(", ")}`);
    if (e.description) out.push(`   ${e.description.replace(/\n/g, "\n   ")}`);
    out.push("");
  });
  return out;
}

/** Text for the "Copy for Daily Report" button: one day, oldest entry first. */
export function dailyReport(entries: Entry[], date: string): string {
  const list = entries.filter((e) => e.date === date).sort(byTime);
  if (!list.length) return "";
  const total = sumMinutes(list);
  const out = [`Daily Report: ${longDay(date)}`, ...(total > 0 ? [`Total hours: ${formatHM(total)}`] : []), ""];
  return [...out, ...dayLines(list)].join("\n").trim();
}

/**
 * Text for the "Copy for Weekly Report" button: the Monday to Sunday week that contains `date`, one heading per day
 * with entries, oldest first, and the hours for the day and the week. `origin` (the first day of the logbook) is Week 1.
 */
export function weeklyReport(entries: Entry[], date: string, origin: string): string {
  const start = weekStart(date), end = weekEnd(date);
  const list = entries.filter((e) => e.date >= start && e.date <= end).sort(byTime);
  if (!list.length) return "";
  const total = sumMinutes(list);
  const out = [`Weekly Report: Week ${weekNumber(start, origin || start)} (${weekRange(start)})`, ...(total > 0 ? [`Total hours: ${formatHM(total)}`] : []), ""];
  const days = new Map<string, Entry[]>();
  list.forEach((e) => days.set(e.date, [...(days.get(e.date) ?? []), e]));
  days.forEach((dayList, day) => {
    const m = sumMinutes(dayList);
    out.push(`${longDay(day)}${m > 0 ? ` (${formatHM(m)})` : ""}`, ...dayLines(dayList));
  });
  return out.join("\n").trim();
}

/**
 * Text for the "Copy descriptions" button: one heading per week and per day, oldest first, with that day's
 * descriptions under it in the order they were logged.
 */
export function allDescriptions(entries: Entry[]): string {
  const origin = earliestDay(entries);
  const weeks = new Map<string, Map<string, string[]>>();
  [...entries].sort(byTime).filter((e) => e.description).forEach((e) => {
    const wk = weekStart(e.date);
    const days = weeks.get(wk) ?? new Map<string, string[]>();
    days.set(e.date, [...(days.get(e.date) ?? []), e.description]);
    weeks.set(wk, days);
  });
  return [...weeks]
    .map(([wk, days]) => {
      const body = [...days].map(([date, list]) => `${longDay(date)}\n${list.join("\n\n")}`).join("\n\n\n");
      return `Week ${weekNumber(wk, origin)} (${weekRange(wk)})\n\n${body}`;
    })
    .join("\n\n\n\n");
}

export function entryText(e: Entry): string {
  return [
    e.title,
    e.skills.length ? `Skills acquired: ${e.skills.join(", ")}` : "",
    e.description,
  ].filter(Boolean).join("\n");
}

/** Copies text; resolves false when the browser refuses so the caller can show a fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
