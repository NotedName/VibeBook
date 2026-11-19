import { shareBase } from "./platform";
import type { FormKind } from "./formDocs";
import type { ReportDetails } from "./reportDocs";

/**
 * The evaluation forms are filled in by the supervisor, not the intern. The intern makes a link that carries the form's details
 * (name, course, dates, hours) inside the address itself, after the #. The supervisor opens it without an account, answers, and exports
 * a Word or PDF file on their own device. Nothing is sent to or kept on a server, and the intern never sees the answers.
 */
export type EvalPayload = {
  k: "eval" | "comments";
  d: Pick<ReportDetails, "traineeName" | "term" | "school" | "location" | "department" | "program" | "schoolYear" | "deployed">;
  from: string; to: string;
  /** days with logged hours and total minutes inside the period; only the evaluation report uses them */
  days: number; minutes: number; started: string;
};

const toB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

export const evalLink = (p: EvalPayload) => `${shareBase()}#/evaluate/${toB64(JSON.stringify(p))}`;

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** The form in a #/evaluate/<code> address, or null when there is none or it is damaged. */
export function parseEvalHash(hash: string): EvalPayload | null {
  const m = hash.match(/^#\/evaluate\/([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const r = JSON.parse(fromB64(m[1]));
    if ((r.k !== "eval" && r.k !== "comments") || !date(r.from) || !date(r.to)) return null;
    const d = r.d ?? {};
    return {
      k: r.k, from: date(r.from), to: date(r.to), days: Math.max(0, Math.floor(Number(r.days) || 0)), minutes: Math.max(0, Math.floor(Number(r.minutes) || 0)), started: date(r.started),
      d: { traineeName: str(d.traineeName), term: str(d.term), school: str(d.school), location: str(d.location), department: str(d.department), program: str(d.program), schoolYear: str(d.schoolYear), deployed: date(d.deployed) },
    };
  } catch { return null; }
}

export const isEvalKind = (k: FormKind): k is "eval" | "comments" => k === "eval" || k === "comments";
