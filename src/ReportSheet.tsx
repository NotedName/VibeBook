import { useEffect, useMemo, useState, type FormEvent } from "react";
import { loadPhotos, type Entry } from "./entries";
import { todayStr } from "./report";
import { buildReport, entriesInRange, EMPTY_DETAILS, reportRange, type ReportDetails, type ReportImage, type ReportKind } from "./reportDocs";
import { toReportImage } from "./reportImages";
import { saveReportDetails, useReportDetails } from "./hours";
import { downloadFile } from "./download";
import { formatHM, sumMinutes, weekRange } from "./weeks";
import { useSession } from "./session";
import { CloseIcon, DownloadIcon } from "./icons";
import { useScrollLock } from "./scrollLock";

type Format = "docx" | "pdf";
const FORMATS: { id: Format; label: string; mime: string; kind: string }[] = [
  { id: "docx", label: "Word (.docx)", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "Word document" },
  { id: "pdf", label: "PDF", mime: "application/pdf", kind: "PDF" },
];
const KINDS: { id: ReportKind; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "period", label: "Date range" },
];
/** A report longer than this is almost certainly a mistake in the dates, and would be huge with photos. */
const MAX_DAYS = 400;

const FIELDS: { key: keyof ReportDetails; label: string; placeholder: string }[] = [
  { key: "school", label: "School", placeholder: "School or company name" },
  { key: "department", label: "Department", placeholder: "e.g. College Department" },
  { key: "program", label: "Program", placeholder: "e.g. Information Technology Program" },
  { key: "schoolYear", label: "School year", placeholder: "e.g. 2026-2027" },
  { key: "traineeName", label: "Name of trainee", placeholder: "Your full name" },
  { key: "course", label: "Course", placeholder: "e.g. BSIT" },
  { key: "term", label: "Term", placeholder: "e.g. Prelim" },
];

type Props = {
  /** Your own entries (not archived, not reposts). */
  entries: Entry[];
  /** Dates to start the custom range with, e.g. the date filter on the logbook. */
  initialRange?: { from: string; to: string };
  onClose: () => void;
};

/** Export a daily, weekly or date-range report as a Word or PDF file in the layout of the school's OJT report. */
export default function ReportSheet({ entries, initialRange, onClose }: Props) {
  const s = useSession();
  const stored = useReportDetails(s.uid);
  const [details, setDetails] = useState<ReportDetails | null>(null);
  const [kind, setKind] = useState<ReportKind>(initialRange ? "period" : "daily");
  const [day, setDay] = useState(todayStr());
  const [from, setFrom] = useState(initialRange?.from || todayStr());
  const [to, setTo] = useState(initialRange?.to || todayStr());
  const [format, setFormat] = useState<Format>("docx");
  const [withPhotos, setWithPhotos] = useState(true);
  const [showHours, setShowHours] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // The saved details fill the form once; after that the form is the person's own until they save.
  useEffect(() => {
    if (stored && !details) setDetails({ ...stored, traineeName: stored.traineeName || s.me?.displayName || "" });
  }, [stored, details, s.me]);

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const range = reportRange(kind, day, from, to);
  const inRange = useMemo(() => entriesInRange(entries, range.from, range.to), [entries, range.from, range.to]);
  const photoTotal = inRange.reduce((n, e) => n + e.photoCount, 0);
  const dayCount = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 864e5) + 1;
  const rangeProblem = !range.from || !range.to ? "Pick the dates."
    : range.from > range.to ? "The From date is after the To date."
    : dayCount > MAX_DAYS ? `Pick at most ${MAX_DAYS} days.` : "";

  function setDetail(key: keyof ReportDetails, value: string) {
    setDetails((d) => ({ ...(d ?? EMPTY_DETAILS), [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (rangeProblem || inRange.length === 0 || !details) return;
    setError("");
    try {
      const photos = new Map<string, ReportImage[]>();
      if (withPhotos) {
        const withPics = inRange.filter((x) => x.photoCount > 0);
        let done = 0;
        for (const entry of withPics) {
          setBusy(`Loading photos ${done + 1} of ${withPics.length}…`);
          const list = await loadPhotos(s.uid, entry.id);
          const images = (await Promise.all(list.map((p) => toReportImage(p.data)))).filter((x): x is ReportImage => x !== null);
          photos.set(entry.id, images);
          done++;
        }
      }
      setBusy(`Making the ${format === "docx" ? "Word file" : "PDF"}…`);
      const model = buildReport({ kind, from: range.from, to: range.to, entries, details, photos, showHours });
      const bytes = format === "docx"
        ? await (await import("./reportWord")).makeWord(model)
        : await (await import("./reportPdf")).makePdf(model);
      const f = FORMATS.find((x) => x.id === format)!;
      saveReportDetails(s.uid, details).catch(() => {}); // remembered for next time; the report does not depend on it
      const saved = await downloadFile(bytes, `${model.fileName}.${format}`, f.mime, f.kind);
      if (!saved) { setError("The file was not saved. Try again."); setBusy(""); return; }
      s.notify(format === "docx" ? "Word report saved" : "PDF report saved");
      onClose();
    } catch (err) {
      setError((err as Error).message || "Could not make the report.");
      setBusy("");
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="Export report" onSubmit={submit}>
        <div className="sheet-head">
          <h2>Export report</h2>
          <button type="button" className="icon-btn close" aria-label="Close" disabled={!!busy} onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="sheet-body">
          <fieldset className="setting">
            <legend>Report for</legend>
            <div className="seg">
              {KINDS.map((k) => (
                <label key={k.id} className={kind === k.id ? "on" : ""}>
                  <input type="radio" name="kind" checked={kind === k.id} onChange={() => setKind(k.id)} />{k.label}
                </label>
              ))}
            </div>
          </fieldset>

          {kind === "period" ? (
            <div className="hours-grid two">
              <label>From <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
              <label>To <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
          ) : (
            <label>{kind === "daily" ? "Date" : "Any day in the week"}
              <input type="date" value={day} onChange={(e) => setDay(e.target.value || todayStr())} />
            </label>
          )}
          {kind === "weekly" && <p className="hint">Week of {weekRange(range.from)} (Monday to Sunday).</p>}
          <p className={rangeProblem ? "error" : "hint"} role={rangeProblem ? "alert" : undefined}>
            {rangeProblem
              || (inRange.length === 0
                ? "No entries in these dates."
                : `${inRange.length} ${inRange.length === 1 ? "entry" : "entries"} · ${formatHM(sumMinutes(inRange))} logged${withPhotos && photoTotal > 0 ? ` · ${photoTotal} ${photoTotal === 1 ? "photo" : "photos"}` : ""}`)}
          </p>

          <fieldset className="setting">
            <legend>File type</legend>
            <div className="seg two">
              {FORMATS.map((f) => (
                <label key={f.id} className={format === f.id ? "on" : ""}>
                  <input type="radio" name="format" checked={format === f.id} onChange={() => setFormat(f.id)} />{f.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="switch-row">
            <span>Include photos<small>Pictures sit beside the descriptions. Many photos make a bigger file.</small></span>
            <input type="checkbox" role="switch" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />
            <i className="switch" aria-hidden="true" />
          </label>
          <label className="switch-row">
            <span>Show hours worked<small>Adds an Hours column and a total. The school's own template has none.</small></span>
            <input type="checkbox" role="switch" checked={showHours} onChange={(e) => setShowHours(e.target.checked)} />
            <i className="switch" aria-hidden="true" />
          </label>

          <fieldset className="setting report-details">
            <legend>Printed at the top (remembered for next time)</legend>
            {details === null ? <p className="hint">Loading…</p> : FIELDS.map((f) => (
              <label key={f.key}>{f.label}
                <input value={details[f.key]} maxLength={120} placeholder={f.placeholder} onChange={(e) => setDetail(f.key, e.target.value)} />
              </label>
            ))}
          </fieldset>

          {error && <p className="error" role="alert">{error}</p>}
        </div>

        <div className="sheet-actions">
          <button type="button" className="btn" disabled={!!busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!!busy || !!rangeProblem || inRange.length === 0 || details === null}>
            {busy || <><DownloadIcon /> Download</>}
          </button>
        </div>
      </form>
    </div>
  );
}
