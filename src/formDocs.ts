import type { Entry } from "./entries";
import { capitalizeWords, entriesInRange, type ReportDetails } from "./reportDocs";
import { clockTime } from "./report";
import { sumMinutes } from "./weeks";

/**
 * The school's OJT forms, laid out like the documents the school hands out (Times New Roman, tight spacing, header lines in the body).
 * One small block model feeds both writers (formWord.ts, formPdf.ts).
 *
 *   dtr       Daily Time Record: every logged day with time in, time out and hours. Prepared by the student, noted by the supervisor.
 *   journal   Term Journal Report: the six questions with the student's answers.
 *   plan      OJT Training Plan: the activities the student has done, taken from the logbook.
 *   eval      Practicum Training Evaluation Report. The evaluator fills in the ratings (see evalLink.ts); nothing is stored.
 *   comments  Practicum Training Evaluation, Comments. Filled in by the evaluator the same way.
 */
export type FormKind = "dtr" | "journal" | "plan" | "eval" | "comments";
export const FORM_KINDS: FormKind[] = ["dtr", "journal", "plan", "eval", "comments"];
export const isFormKind = (k: string): k is FormKind => (FORM_KINDS as string[]).includes(k);
/** The two forms that a supervisor fills in on their own device, from a link. */
export const isEvaluatorKind = (k: string): k is "eval" | "comments" => k === "eval" || k === "comments";

export type Run = { text: string; bold?: boolean; italic?: boolean };
export type Cell = string | { text: string; bold?: boolean; span?: number; align?: "left" | "center"; size?: number };
export type Block =
  | { t: "p"; runs: Run[]; align?: "left" | "center" | "justify" }
  | { t: "table"; widths: number[]; rows: Cell[][]; headerRows?: number; align?: ("left" | "center")[]; center?: boolean; tight?: boolean }
  | { t: "cols"; widths: number[]; cells: Run[][] }
  | { t: "lines"; count: number }
  | { t: "sig"; left: SigSide; right?: SigSide };
export type SigSide = { label: string; name: string; caption: string };
export type FormDoc = {
  head: { text: string; bold?: boolean }[];
  /** point size of the body text */
  size: number;
  margins: { top: number; bottom: number; left: number; right: number };
  blocks: Block[];
  fileName: string;
};

export const JOURNAL_QUESTIONS = [
  "What personal values have helped you in performing your duties and responsibilities in your practicum?",
  "What are the situations that you have experienced in the performance of your task which you think have helped you develop your personality?",
  "What are the strengths that you discover within yourself as you perform your task?",
  "What are the weaknesses within yourself which you need to overcome to make you a better person?",
  "What opportunity do you see in your practicum?",
  "What new learnings have you gained as you go along with practicum?",
];

export const EVAL_SCALE = [
  { id: "E", label: "Excellent" }, { id: "VG", label: "Very Good" }, { id: "G", label: "Good" }, { id: "F", label: "Fair" }, { id: "P", label: "Poor" },
];
/** The criteria, in the school's order. `sub` is the description line printed under an item. Ratings are keyed "A1", "D3", ... */
export const EVAL_SECTIONS: { id: string; title: string; items: { text: string; sub?: string }[] }[] = [
  { id: "A", title: "A. QUALITY OF WORK", items: [
    { text: "1. Accuracy and thoroughness of work" }, { text: "2. Work output as product or analytical and with logical thinking" }, { text: "3. Errors in work process corrected in time" } ] },
  { id: "B", title: "B. JOB KNOWLEDGE", items: [
    { text: "1. Learned knowledge applied to actual situations" }, { text: "2. Awareness of the job requirements and responsibilities" }, { text: "3. Adeptness at using the computer and other office equipment" } ] },
  { id: "C", title: "C. QUANTITY OF WORK", items: [
    { text: "1. Productivity of the trainee" }, { text: "2. Rate of performing task" }, { text: "3. Consistency in rate performance task" } ] },
  { id: "D", title: "D. WORK ATTITUDE", items: [
    { text: "1. Dependability", sub: "Dependability to finish assigned task on time" }, { text: "2. Diligence", sub: "Diligence and concentration on the work" },
    { text: "3. Judgement", sub: "Judgement dependability even under stress" }, { text: "4. Initiative", sub: "Initiative and resourcefulness in undertaking responsibilities with minimum supervision" },
    { text: "5. Cooperation", sub: "Cooperative and willing to work in as group" }, { text: "6. Human Relations", sub: "Ability to work in harmony with others and open minded" },
    { text: "7. Punctuality and Attendance", sub: "Punctual and regular in attendance" } ] },
  { id: "E", title: "E. PERSONAL BEHAVIOR TRAITS", items: [
    { text: "1. Conduct himself in a dignified and professional manner" }, { text: "2. Shows genuine interest and enthusiasm in his career course" }, { text: "3. Presents ideas clearly and with confidence" },
    { text: "4. Manifest sufficient willingness and capacity to work harmoniously with superior and equals" }, { text: "5. Grasps situations and draw logical conclusions" },
    { text: "6. Ability to work using equipment" }, { text: "7. Show courtesy and respect in ways and manner" }, { text: "8. Is well-groomed; uses appropriate attire" }, { text: "9. Exercise of care when using equipment" } ] },
];
export const EVAL_KEYS = EVAL_SECTIONS.flatMap((s) => s.items.map((_, i) => `${s.id}${i + 1}`));

/** What the evaluator adds on their own device. None of it is stored. */
export type EvaluatorAnswers = {
  ratings?: Record<string, string>; initials?: string; date?: string;
  strengths?: string; improvements?: string; comments?: string; evaluator?: string;
};

const ymd = (date: string) => { const [y, m, d] = date.split("-").map(Number); return new Date(y, m - 1, d); };
const shortDay = (date: string) => ymd(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const fullDay = (date: string) => (date ? ymd(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");
const hrs = (minutes: number) => {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m === 0 ? `${h} ${h === 1 ? "hr" : "hrs"}` : `${h} ${h === 1 ? "hr" : "hrs"} ${m} mins`;
};
const line = (n: number) => "_".repeat(n);
const P = (text: string, o: { bold?: boolean; italic?: boolean; align?: "left" | "center" | "justify" } = {}): Block => ({ t: "p", runs: [{ text, bold: o.bold, italic: o.italic }], align: o.align });
const PR = (runs: Run[], align?: "left" | "center" | "justify"): Block => ({ t: "p", runs, align });
const BLANK = (n = 1): Block[] => Array.from({ length: n }, () => P(""));
const schoolYear = (d: ReportDetails) => (d.schoolYear ? `S.Y. ${d.schoolYear.replace(/^S\.?Y\.?\s*/i, "")}` : "");

/** The school lines at the top, in the body like the originals. DTR, journal and plan add PRACTICUM; the evaluation forms do not. */
function head(d: ReportDetails, style: "student" | "evaluation", withSchoolYear: boolean): FormDoc["head"] {
  const school = d.school.trim();
  if (style === "student") {
    const top = [school.toUpperCase(), capitalizeWords(d.location.trim()), capitalizeWords(d.department.trim()), capitalizeWords(d.program.trim()), withSchoolYear ? schoolYear(d) : ""].filter(Boolean);
    return [...top.map((text, i) => ({ text, bold: i === 0 })), { text: "" }, { text: "PRACTICUM", bold: true }];
  }
  return [{ text: school }, { text: capitalizeWords(d.location.trim()) }, { text: capitalizeWords(d.department.trim()) }, { text: withSchoolYear ? schoolYear(d) : "" }].filter((l) => l.text);
}

/** Days with logged hours inside the range: first time in, last time out and the net hours of the day (breaks already taken out). */
export function dayRecords(entries: Entry[], from: string, to: string) {
  const days = new Map<string, Entry[]>();
  for (const e of entriesInRange(entries, from, to)) {
    if (!e.clockIn || !e.clockOut) continue;
    days.set(e.date, [...(days.get(e.date) ?? []), e]);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, es]) => {
    const ins = es.map((e) => e.clockIn ?? "").sort(), outs = es.map((e) => e.clockOut ?? "").sort();
    return { date, timeIn: ins[0], timeOut: outs[outs.length - 1], minutes: sumMinutes(es) };
  });
}

/** `stats` replaces the logbook when the form is made from a link: the evaluator has no access to the entries. */
export type FormInput = { kind: FormKind; from: string; to: string; entries: Entry[]; details: ReportDetails; answers?: string[]; evaluator?: EvaluatorAnswers; stats?: { days: number; minutes: number; started: string } };

const STUDENT_MARGINS = { top: 1, bottom: 1, left: 1, right: 1 };

export function buildForm(input: FormInput): FormDoc {
  const { kind, from, to, details: d } = input;
  const name = capitalizeWords(d.traineeName.trim());
  const term = capitalizeWords(d.term.trim());
  const days = dayRecords(input.entries, from, to);
  const totalMin = input.stats?.minutes ?? days.reduce((n, r) => n + r.minutes, 0);
  const dayCount = input.stats?.days ?? days.length;
  const short = (x: string) => ymd(x).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const inclusive = `${short(from)} – ${short(to)}`;
  const course = capitalizeWords(d.program.trim());
  const stem = (n: string) => `${n}_${from}_to_${to}`;

  if (kind === "dtr") {
    const rows: Cell[][] = days.map((r) => [shortDay(r.date), clockTime(r.timeIn), clockTime(r.timeOut), hrs(r.minutes)]);
    return {
      head: head(d, "student", true), size: 12, margins: STUDENT_MARGINS, fileName: stem("OJT_Daily_Time_Record"),
      blocks: [
        P("DAILY TIME RECORD", { bold: true, align: "center" }),
        PR([{ text: `Term: ${term || line(36)}`, bold: true }], "center"),
        ...BLANK(),
        { t: "table", widths: [1.2, 1.3, 1.3, 1.7], headerRows: 1, center: true, tight: true,
          rows: [["Date", "Time-in", "Time-out", "Total no. of Hours"].map((h) => ({ text: h, bold: true })), ...rows, [{ text: "Total", bold: true }, "", "", { text: hrs(totalMin), bold: true }]] },
        ...BLANK(2),
        { t: "sig", left: { label: "Prepared by:", name, caption: "(Name of Student)" }, right: { label: "Noted by:", name: capitalizeWords(d.supervisor.trim()), caption: "(Name of Supervisor)" } },
        ...BLANK(),
        PR([{ text: "Note: Please attach e-signature over printed name.", italic: true }]),
      ],
    };
  }

  if (kind === "journal") {
    const answers = input.answers ?? [];
    const blocks: Block[] = [
      P("TERM JOURNAL REPORT", { bold: true, align: "center" }),
      PR([{ text: `Term: ${term || line(38)}`, bold: true }], "center"),
      PR([{ text: `Inclusive Dates: ${inclusive}`, bold: true }], "center"),
      ...BLANK(3),
    ];
    JOURNAL_QUESTIONS.forEach((q, i) => {
      blocks.push(P(`${i + 1}.  ${q}`, { align: "justify" }), ...BLANK());
      const a = (answers[i] ?? "").trim();
      if (a) a.split(/\n+/).forEach((para) => blocks.push(P(para, { align: "justify" })));
      else blocks.push({ t: "lines", count: 2 });
      blocks.push(...BLANK());
    });
    blocks.push(...BLANK(), { t: "sig", left: { label: "Prepared by:", name, caption: "(Name of Student)" } });
    return { head: head(d, "student", true), size: 12, margins: STUDENT_MARGINS, fileName: stem("OJT_Term_Journal"), blocks };
  }

  if (kind === "plan") {
    // One row per activity in the entries (the comma-separated items of each Activity), with the skills gained and the days it was done.
    type Task = { name: string; dates: string[]; skills: string[]; seen: Set<string> };
    const tasks = new Map<string, Task>();
    for (const e of entriesInRange(input.entries, from, to).filter((x) => !x.hoursOnly)) {
      for (const raw of e.title.split(",")) {
        const n = capitalizeWords(raw.trim().replace(/\s+/g, " "));
        if (!n) continue;
        const t = tasks.get(n.toLowerCase()) ?? { name: n, dates: [], skills: [], seen: new Set<string>() };
        if (!t.dates.includes(e.date)) t.dates.push(e.date);
        for (const sk of e.skills) { const k = sk.trim().toLowerCase(); if (k && !t.seen.has(k)) { t.seen.add(k); t.skills.push(capitalizeWords(sk.trim())); } }
        tasks.set(n.toLowerCase(), t);
      }
    }
    const many = from.slice(0, 4) !== to.slice(0, 4);
    const md = (x: string) => ymd(x).toLocaleDateString("en-US", many ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
    const rows: Cell[][] = [...tasks.values()].sort((a, b) => a.dates[0].localeCompare(b.dates[0]) || a.name.localeCompare(b.name)).map((t, i) => [
      String(i + 1), { text: t.name, align: "left" as const }, { text: t.skills.slice(0, 6).join(", ") || "–", align: "left" as const },
      t.dates.length <= 2 ? t.dates.map(md).join(", ") : `${md(t.dates[0])} – ${md(t.dates[t.dates.length - 1])} (${t.dates.length} days)`,
    ]);
    return {
      head: head(d, "student", true), size: 12, margins: STUDENT_MARGINS, fileName: stem("OJT_Training_Plan"),
      blocks: [
        P("OJT TRAINING PLAN", { bold: true, align: "center" }),
        ...BLANK(),
        PR([{ text: "Name of Student: ", bold: true }, { text: name || line(30) }]),
        PR([{ text: "Course: ", bold: true }, { text: course || line(30) }]),
        PR([{ text: "Company: ", bold: true }, { text: capitalizeWords(d.company.trim()) || line(30) }]),
        PR([{ text: "Date of Deployment: ", bold: true }, { text: fullDay(d.deployed) || line(24) }]),
        ...BLANK(),
        { t: "table", widths: [0.5, 2.2, 2.3, 1.5], headerRows: 1, tight: true,
          rows: [["No.", "Training Activity", "Skill/s Acquired", "Date/s Performed"].map((h) => ({ text: h, bold: true })), ...rows] },
        ...BLANK(2),
        P("Submitted by:"), ...BLANK(2),
        { t: "sig", left: { label: "", name, caption: "Printed Name with Signature" } },
      ],
    };
  }

  const ev = input.evaluator ?? {};
  if (kind === "eval") {
    const period = (term || "Prelim").toUpperCase();
    const rating = (k: string): string => ev.ratings?.[k] ?? "";
    const rows: Cell[][] = [
      [{ text: `Evaluation Scale:   ${EVAL_SCALE.map((s) => `${s.id}-${s.label}`).join("   ")}`, bold: true, span: 2, align: "left" }],
      [{ text: "CRITERIA", bold: true }, { text: "EVALUATION PERIOD", bold: true, size: 9 }],
      ["", { text: period, bold: true }],
    ];
    for (const sec of EVAL_SECTIONS) {
      rows.push([{ text: sec.title, bold: true, align: "left" }, ""]);
      sec.items.forEach((it, i) => {
        rows.push([{ text: it.text, align: "left" }, rating(`${sec.id}${i + 1}`)]);
        if (it.sub) rows.push([{ text: it.sub, align: "left" }, ""]);
      });
    }
    rows.push([{ text: "Initials of Evaluator", align: "left" }, ev.initials ?? ""], [{ text: "Date", align: "left" }, fullDay(ev.date ?? "")]);
    return {
      head: head(d, "evaluation", false), size: 11, margins: { top: 0.5, bottom: 0.5, left: 1, right: 1 }, fileName: stem("OJT_Training_Evaluation_Report"),
      blocks: [
        P("PRACTICUM TRAINING EVALUATION REPORT", { bold: true, align: "center" }),
        { t: "table", widths: [4.03, 2.46], align: ["left", "left"], tight: true,
          rows: [
            [`Name of Trainee: ${name}`, `Course: ${course}`],
            [`Date Started: ${fullDay(d.deployed || input.stats?.started || days[0]?.date || from)}`, `Date Completed: ${fullDay(to)}`],
            [`No. of days attendance: ${dayCount || ""}`, `No. of hours completed: ${totalMin ? hrs(totalMin) : ""}`],
          ] },
        ...BLANK(),
        { t: "table", widths: [4.72, 1.75], rows, tight: true },
      ],
    };
  }

  // comments
  const text = (v: string | undefined, blanks: number): Block[] =>
    v?.trim() ? v.trim().split(/\n+/).map((x) => P(x, { align: "justify" })) : blanks > 0 ? BLANK(blanks) : [];
  return {
    head: head(d, "evaluation", true), size: 11, margins: STUDENT_MARGINS, fileName: stem("OJT_Training_Evaluation_Comments"),
    blocks: [
      ...BLANK(),
      P("PRACTICUM TRAINING EVALUATION REPORT", { bold: true, align: "center" }),
      ...BLANK(),
      { t: "cols", widths: [3.4, 3.1], cells: [[{ text: `Name of Trainee: ${name || line(28)}` }], [{ text: `Course-Major: ${course || line(20)}` }]] },
      { t: "cols", widths: [3.4, 3.1], cells: [[{ text: `Inclusive Dates: ${inclusive}` }], [{ text: `Term: ${term || line(20)}` }]] },
      ...BLANK(),
      P("Trainee’s Strengths:", { bold: true }), ...text(ev.strengths, 5), ...(ev.strengths?.trim() ? BLANK() : []),
      P("Trainee’s Points for Improvements:", { bold: true }), ...text(ev.improvements, 5), ...(ev.improvements?.trim() ? BLANK() : []),
      P("Comments:", { bold: true }), ...text(ev.comments, 6), ...(ev.comments?.trim() ? BLANK() : []),
      PR([{ text: "Evaluator (Company):" }]),
      { t: "sig", left: { label: "", name: ev.evaluator?.trim() ?? "", caption: "Signature over Printed Name" } },
    ],
  };
}
