import type { Entry } from "./entries";
import { formatHM, sumMinutes, weekEnd, weekOfMonthLabel, weekStart } from "./weeks";

/**
 * The content of an exported report, laid out like the school's daily OJT report: a heading, the trainee's details, a table
 * of Dates / Activity/ies / Skill/s Acquired, then "Pictures taken during the Week" with the descriptions beside them.
 * This file only builds that content; reportWord.ts and reportPdf.ts draw it.
 */
export type ReportKind = "daily" | "weekly" | "period";

/** Printed at the top of every report. Blank lines are left out (except the trainee's own three). */
export type ReportDetails = {
  traineeName: string; course: string; term: string;
  school: string; department: string; program: string; schoolYear: string;
};
export const EMPTY_DETAILS: ReportDetails = { traineeName: "", course: "", term: "", school: "", department: "", program: "", schoolYear: "" };

/** A JPEG ready to place in a document. */
export type ReportImage = { bytes: Uint8Array; width: number; height: number };

export type ReportTable = {
  headers: string[];
  /** Column widths in inches; they add up to the 6.5 inches between the margins. */
  widths: number[];
  rows: string[][];
  /** A bold last row, e.g. the total hours. */
  footer?: string[];
};

/** One week's pictures (left) and descriptions (right), like a row of the second table in the example. */
export type ReportGroup = { label: string; images: ReportImage[]; paragraphs: string[] };

export type ReportModel = {
  /** School name first (printed bold), then the department, program and school year. */
  headerLines: string[];
  title: string;
  info: string[];
  table: ReportTable;
  picturesTitle: string;
  groups: ReportGroup[];
  fileName: string;
};

export type ReportInput = {
  kind: ReportKind;
  /** First and last day, YYYY-MM-DD. A daily report has from === to. */
  from: string;
  to: string;
  /** Your own entries. Only those inside the dates are used. */
  entries: Entry[];
  details: ReportDetails;
  /** Photos by entry id, in the entry's own order. Leave empty to print no pictures. */
  photos?: Map<string, ReportImage[]>;
  showHours?: boolean;
};

const byTime = (a: Entry, b: Entry) => (a.date + a.time).localeCompare(b.date + b.time);

/** The entries a report with these dates would cover, oldest first. */
export const entriesInRange = (entries: Entry[], from: string, to: string): Entry[] =>
  entries.filter((e) => e.date >= from && e.date <= to).sort(byTime);

/** The first and last day a kind of report covers, given the day picked. Custom reports use the dates as given. */
export function reportRange(kind: ReportKind, day: string, from: string, to: string): { from: string; to: string } {
  if (kind === "daily") return { from: day, to: day };
  if (kind === "weekly") return { from: weekStart(day), to: weekEnd(day) };
  return { from, to };
}

const monthDay = (date: string, withYear: boolean) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
};

/** Titles and skills are joined with commas, so a trailing full stop or comma would read oddly. */
const tidy = (s: string) => s.trim().replace(/[.,;:\s]+$/, "");

/** Skills of several entries, each once (ignoring capitals), in the order first met. */
function uniqueSkills(list: Entry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  list.forEach((e) => e.skills.forEach((raw) => {
    const s = raw.trim();
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
  }));
  return out;
}

/** A description as paragraphs: one per line of text, blank lines dropped. */
const paragraphsOf = (text: string) => text.split(/\n+/).map((p) => p.trim()).filter(Boolean);

export function reportFileName(kind: ReportKind, from: string, to: string): string {
  if (kind === "daily") return `OJT_Daily_Report_${from}`;
  if (kind === "weekly") return `OJT_Weekly_Report_${from}_to_${to}`;
  return `OJT_Report_${from}_to_${to}`;
}

export function buildReport(input: ReportInput): ReportModel {
  const { kind, from, to, details, showHours = false } = input;
  const list = entriesInRange(input.entries, from, to);
  const manyYears = from.slice(0, 4) !== to.slice(0, 4);

  // One table row per day that has entries.
  const days = new Map<string, Entry[]>();
  list.forEach((e) => days.set(e.date, [...(days.get(e.date) ?? []), e]));
  const rows = [...days].map(([date, es]) => {
    const row = [monthDay(date, manyYears), es.map((e) => tidy(e.title)).filter(Boolean).join(", "), uniqueSkills(es).join(", ")];
    return showHours ? [...row, sumMinutes(es) > 0 ? formatHM(sumMinutes(es)) : "–"] : row;
  });
  const table: ReportTable = showHours
    ? { headers: ["Dates", "Activity/ies", "Skill/s Acquired", "Hours"], widths: [1.0, 2.8, 1.9, 0.8], rows, footer: ["Total", "", "", formatHM(sumMinutes(list))] }
    : { headers: ["Dates", "Activity/ies", "Skill/s Acquired"], widths: [1.2, 3.2, 2.1], rows };

  // One pictures-and-descriptions row per week that has entries.
  const weeks = new Map<string, Entry[]>();
  list.forEach((e) => weeks.set(weekStart(e.date), [...(weeks.get(weekStart(e.date)) ?? []), e]));
  const groups: ReportGroup[] = [...weeks].map(([monday, es]) => ({
    label: weekOfMonthLabel(monday),
    images: es.flatMap((e) => input.photos?.get(e.id) ?? []),
    paragraphs: es.flatMap((e) => paragraphsOf(e.description)),
  }));

  const headerLines = [details.school, details.department, details.program, details.schoolYear ? `S.Y. ${details.schoolYear.replace(/^S\.?Y\.?\s*/i, "")}` : ""]
    .map((l) => l.trim()).filter(Boolean);
  const info = [`Name of Trainee: ${details.traineeName.trim()}`, `Course: ${details.course.trim()}`, `Term: ${details.term.trim()}`];
  if (kind !== "daily") info.push(`Period: ${monthDay(from, true)} – ${monthDay(to, true)}`);

  return {
    headerLines,
    title: kind === "daily" ? "DAILY OJT REPORT" : kind === "weekly" ? "WEEKLY OJT REPORT" : "OJT REPORT",
    info,
    table,
    picturesTitle: "Pictures taken during the Week:",
    groups,
    fileName: reportFileName(kind, from, to),
  };
}

/** Total hours of the entries a report would cover, for the preview line in the export sheet. */
export const rangeMinutes = (entries: Entry[], from: string, to: string) => sumMinutes(entriesInRange(entries, from, to));
