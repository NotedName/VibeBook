import { collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { shareBase } from "./platform";
import type { ReportDetails } from "./reportDocs";

/**
 * The evaluation forms are filled in by the supervisor, not the intern.
 *
 * The intern makes a one-time link. Only the form's details (name, course, dates, hours) are stored, under a random id that cannot be guessed,
 * with a status of "open". The supervisor opens the link without an account, answers, and exports a Word or PDF file on their own device.
 * When the file has been made the status becomes "done" and the link says "Evaluation completed", so it cannot be used twice.
 * The ratings and comments are never sent anywhere or stored, and the intern never sees them.
 */
export type EvalPayload = {
  k: "eval" | "comments";
  d: Pick<ReportDetails, "traineeName" | "term" | "school" | "location" | "department" | "program" | "schoolYear" | "deployed">;
  from: string; to: string;
  /** days with logged hours and total minutes inside the period; only the evaluation report uses them */
  days: number; minutes: number; started: string;
  /** include the page header and footer in the printed form */
  hf: boolean;
};

export type Evaluation = { status: "open" | "done"; payload: EvalPayload };

/** Makes the one-time link for a form. Needs the intern's account. */
export async function createEvalLink(uid: string, payload: EvalPayload): Promise<string> {
  const ref = doc(collection(db, "evaluations"));
  await setDoc(ref, { ownerUid: uid, status: "open", createdAt: serverTimestamp(), payload });
  return `${shareBase()}#/evaluate/${ref.id}`;
}

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** The form named by the link, or null when there is none. Throws when the server cannot be reached. */
export async function loadEvaluation(id: string): Promise<Evaluation | null> {
  const snap = await getDoc(doc(db, "evaluations", id));
  if (!snap.exists()) return null;
  const r = snap.data() as { status?: string; payload?: Record<string, unknown> };
  const p = r.payload ?? {};
  const d = (p.d ?? {}) as Record<string, unknown>;
  if ((p.k !== "eval" && p.k !== "comments") || !date(p.from) || !date(p.to)) return null;
  return {
    status: r.status === "done" ? "done" : "open",
    payload: {
      k: p.k, from: date(p.from), to: date(p.to), days: Math.max(0, Math.floor(Number(p.days) || 0)), minutes: Math.max(0, Math.floor(Number(p.minutes) || 0)), started: date(p.started),
      hf: p.hf !== false,
      d: { traineeName: str(d.traineeName), term: str(d.term), school: str(d.school), location: str(d.location), department: str(d.department), program: str(d.program), schoolYear: str(d.schoolYear), deployed: date(d.deployed) },
    },
  };
}

/** Closes the link. Called once the supervisor's file has been made. */
export async function completeEvaluation(id: string): Promise<void> {
  await updateDoc(doc(db, "evaluations", id), { status: "done", doneAt: serverTimestamp() });
}

/** The form id in a #/evaluate/<id> address, or null. */
export function parseEvalHash(hash: string): string | null {
  const m = hash.match(/^#\/evaluate\/([A-Za-z0-9]{20})$/);
  return m ? m[1] : null;
}
