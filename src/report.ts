import type { Entry } from "./entries";
import { firstChar } from "./text";

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

/** Text for the "Copy for Daily Report" button: one day, oldest entry first. */
export function dailyReport(entries: Entry[], date: string): string {
  const list = entries.filter((e) => e.date === date).sort(byTime);
  if (!list.length) return "";
  const out = [`Daily Report: ${longDay(date)}`, ""];
  list.forEach((e, i) => {
    out.push(`${i + 1}. ${e.title} (${clockTime(e.time)})`);
    if (e.skills.length) out.push(`   Skills acquired: ${e.skills.join(", ")}`);
    if (e.description) out.push(`   ${e.description.replace(/\n/g, "\n   ")}`);
    out.push("");
  });
  return out.join("\n").trim();
}

/**
 * Text for the "Copy descriptions" button: one heading per day, oldest day first, with that day's
 * descriptions under it in the order they were logged.
 */
export function allDescriptions(entries: Entry[]): string {
  const days = new Map<string, string[]>();
  [...entries].sort(byTime).filter((e) => e.description).forEach((e) => {
    days.set(e.date, [...(days.get(e.date) ?? []), e.description]);
  });
  return [...days]
    .map(([date, list]) => `${longDay(date)}\n${list.join("\n\n")}`)
    .join("\n\n\n");
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
