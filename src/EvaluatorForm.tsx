import { useMemo, useState } from "react";
import { buildForm, EVAL_KEYS, EVAL_SCALE, EVAL_SECTIONS, fullDay, type EvaluatorAnswers } from "./formDocs";
import { makeFormWord } from "./formWord";
import { makeFormPdf } from "./formPdf";
import { saveFile } from "./download";
import { EMPTY_DETAILS } from "./reportDocs";
import type { EvalPayload } from "./evalLink";
import { todayStr } from "./report";
import { capitalizeWords } from "./reportDocs";
import FormError from "./FormError";

const MIME = { docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pdf: "application/pdf" };

/** The page a supervisor sees from the link: answer, then print. No account, no storage; the answers stay on this device. */
export default function EvaluatorForm({ payload }: { payload: EvalPayload }) {
  const isEval = payload.k === "eval";
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [initials, setInitials] = useState("");
  const [date, setDate] = useState(todayStr());
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [comments, setComments] = useState("");
  const [evaluator, setEvaluator] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const missing = useMemo(() => (isEval
    ? EVAL_KEYS.filter((k) => !ratings[k]).length + (initials.trim() ? 0 : 1) + (date ? 0 : 1)
    : [strengths, improvements, comments, evaluator].filter((v) => !v.trim()).length), [isEval, ratings, initials, date, strengths, improvements, comments, evaluator]);

  async function make(format: "docx" | "pdf") {
    if (missing > 0) return setError(isEval ? "Rate every item and add your initials and the date first." : "Fill in every box and your name first.");
    setError(""); setBusy(format);
    try {
      const answers: EvaluatorAnswers = isEval ? { ratings, initials: initials.trim().toUpperCase(), date } : { strengths, improvements, comments, evaluator: capitalizeWords(evaluator.trim()) };
      const model = buildForm({
        kind: payload.k, from: payload.from, to: payload.to, entries: [], evaluator: answers,
        details: { ...EMPTY_DETAILS, ...payload.d }, stats: { days: payload.days, minutes: payload.minutes, started: payload.started },
      });
      const bytes = format === "docx" ? await makeFormWord(model) : await makeFormPdf(model);
      const r = await saveFile(bytes, `${model.fileName}.${format}`, MIME[format], format === "docx" ? "Word document" : "PDF");
      if (r === "failed") setError("The file could not be saved to this device. Try again.");
    } catch { setError("The file could not be made. Try again."); }
    setBusy("");
  }

  return (
    <div className="page eval-page">
      <main className="eval-main">
        <header className="eval-head">
          <h1>{isEval ? "Practicum Training Evaluation Report" : "Practicum Training Evaluation: Comments"}</h1>
          <p><b>{capitalizeWords(payload.d.traineeName) || "Trainee"}</b>{payload.d.program ? ` · ${capitalizeWords(payload.d.program)}` : ""}</p>
          <p>{fullDay(payload.from)} – {fullDay(payload.to)}{payload.d.term ? ` · ${capitalizeWords(payload.d.term)}` : ""}</p>
          <p className="hint">Nothing you enter here is saved or sent. You make the Word or PDF file on this device, and the trainee never sees your answers.</p>
        </header>

        {isEval ? (
          <>
            <p className="hint eval-scale">Scale: {EVAL_SCALE.map((s) => `${s.id} – ${s.label}`).join(" · ")}</p>
            {EVAL_SECTIONS.map((sec) => (
              <fieldset key={sec.id} className="eval-sec">
                <legend>{sec.title}</legend>
                {sec.items.map((it, i) => {
                  const key = `${sec.id}${i + 1}`;
                  return (
                    <label key={key} className="eval-row">
                      <span>{it.text}{it.sub && <small>{it.sub}</small>}</span>
                      <select value={ratings[key] ?? ""} required onChange={(e) => setRatings((r) => ({ ...r, [key]: e.target.value }))}>
                        <option value="" disabled>Rate</option>
                        {EVAL_SCALE.map((s) => <option key={s.id} value={s.id}>{s.id} – {s.label}</option>)}
                      </select>
                    </label>
                  );
                })}
              </fieldset>
            ))}
            <div className="row">
              <label>Initials of evaluator<input value={initials} maxLength={6} placeholder="e.g. JD" onChange={(e) => setInitials(e.target.value)} /></label>
              <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            </div>
          </>
        ) : (
          <>
            <label>Trainee’s strengths<textarea rows={4} value={strengths} maxLength={1200} onChange={(e) => setStrengths(e.target.value)} /></label>
            <label>Trainee’s points for improvements<textarea rows={4} value={improvements} maxLength={1200} onChange={(e) => setImprovements(e.target.value)} /></label>
            <label>Comments<textarea rows={4} value={comments} maxLength={1200} onChange={(e) => setComments(e.target.value)} /></label>
            <label>Evaluator’s name<input value={evaluator} maxLength={80} placeholder="Printed name" onChange={(e) => setEvaluator(e.target.value)} /></label>
          </>
        )}

        {error && <FormError>{error}</FormError>}
        <p className="hint" role="status">{missing > 0 ? `${missing} ${missing === 1 ? "item" : "items"} left to answer.` : "All answered. Make the file to print."}</p>
        <div className="sheet-actions eval-actions">
          <button type="button" className="btn primary" disabled={!!busy || missing > 0} onClick={() => void make("docx")}>{busy === "docx" ? "Making…" : "Export Word"}</button>
          <button type="button" className="btn" disabled={!!busy || missing > 0} onClick={() => void make("pdf")}>{busy === "pdf" ? "Making…" : "Export PDF"}</button>
        </div>
      </main>
    </div>
  );
}
