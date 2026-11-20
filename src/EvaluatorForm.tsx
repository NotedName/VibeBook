import { useEffect, useMemo, useState } from "react";
import { buildForm, EVAL_KEYS, EVAL_SCALE, EVAL_SECTIONS, fullDay, type EvaluatorAnswers } from "./formDocs";
import { makeFormWord } from "./formWord";
import { makeFormPdf } from "./formPdf";
import { saveFile } from "./download";
import { EMPTY_DETAILS } from "./reportDocs";
import { completeEvaluation, loadEvaluation, type EvalPayload } from "./evalLink";
import { NetworkUnavailable } from "./network";
import { todayStr } from "./report";
import { capitalizeWords } from "./reportDocs";
import FormError from "./FormError";

const MIME = { docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pdf: "application/pdf" };

/** The page a supervisor sees from the link: answer, then print. No account, and the answers stay on this device. */
export default function EvaluatorForm({ id }: { id: string }) {
  const [state, setState] = useState<"loading" | "open" | "done" | "missing" | "network">("loading");
  const [payload, setPayload] = useState<EvalPayload | null>(null);
  useEffect(() => {
    let live = true;
    loadEvaluation(id).then(
      (ev) => { if (!live) return; if (!ev) setState("missing"); else { setPayload(ev.payload); setState(ev.status); } },
      () => live && setState("network"),
    );
    return () => { live = false; };
  }, [id]);
  if (state === "loading") return <div className="eval-page"><main className="eval-main"><p className="hint" role="status">Opening the form…</p></main></div>;
  if (state === "network") return <div className="eval-page"><main className="eval-main"><NetworkUnavailable /></main></div>;
  if (state === "missing" || !payload) return <div className="eval-page"><main className="eval-main"><div className="empty"><h2>Link not found</h2><p>This evaluation link is not valid. Ask the trainee for a new one.</p></div></main></div>;
  if (state === "done") return <Completed name={payload.d.traineeName} />;
  return <Form id={id} payload={payload} onDone={() => setState("done")} />;
}

function Completed({ name }: { name: string }) {
  return (
    <div className="eval-page">
      <main className="eval-main">
        <div className="empty eval-done" role="status">
          <h2>Evaluation completed</h2>
          <p>{name ? `The form for ${capitalizeWords(name)} has been completed.` : "This form has been completed."} This link is now closed.</p>
        </div>
      </main>
    </div>
  );
}

function Form({ id, payload, onDone }: { id: string; payload: EvalPayload; onDone: () => void }) {
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
        headerFooter: payload.hf, kind: payload.k, from: payload.from, to: payload.to, entries: [], evaluator: answers,
        details: { ...EMPTY_DETAILS, ...payload.d }, stats: { days: payload.days, minutes: payload.minutes, started: payload.started },
      });
      const bytes = format === "docx" ? await makeFormWord(model) : await makeFormPdf(model);
      const r = await saveFile(bytes, `${model.fileName}.${format}`, MIME[format], format === "docx" ? "Word document" : "PDF");
      if (r === "failed") setError("The file could not be saved to this device. Try again.");
      else if (r !== "cancelled") {
        // The file exists, so the link is used up. If the server cannot be reached the file is still good; the link just stays open.
        try { await completeEvaluation(id); onDone(); } catch { setError("The file was saved, but the link could not be closed. Check your connection and make the file once more only if needed."); }
      }
    } catch { setError("The file could not be made. Try again."); }
    setBusy("");
  }

  return (
    <div className="eval-page">
      <main className="eval-main">
        <header className="eval-head">
          <h1>{isEval ? "Practicum Training Evaluation Report" : "Practicum Training Evaluation: Comments"}</h1>
          <p><b>{capitalizeWords(payload.d.traineeName) || "Trainee"}</b>{payload.d.program ? ` · ${capitalizeWords(payload.d.program)}` : ""}</p>
          <p>{fullDay(payload.from)} – {fullDay(payload.to)}{payload.d.term ? ` · ${capitalizeWords(payload.d.term)}` : ""}</p>
          <p className="hint">Your answers are not saved or sent. You make the file on this device, and the trainee never sees it. The link closes after you export.</p>
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
