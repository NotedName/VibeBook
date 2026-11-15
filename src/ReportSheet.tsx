import { FieldsSkeleton } from "./Skeleton";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { loadPhotos, type Entry } from "./entries";
import { copyText, exportText, todayStr } from "./report";
import { buildReport, entriesInRange, EMPTY_DETAILS, reportRange, type ReportDetails, type ReportImage, type ReportKind } from "./reportDocs";
import { toReportImage } from "./reportImages";
import { clearReportDetails, saveReportDetails, useReportDetails } from "./hours";
import { saveFile } from "./download";
import { describeExportError, ExportError } from "./exportErrors";
import { makeWord } from "./reportWord";
import { makePdf } from "./reportPdf";
import { earliestDay, formatHM, sumMinutes, weekOfMonthShort, weekRange, weekStart } from "./weeks";
import { useSession } from "./session";
import { CloseIcon, CopyIcon, DownloadIcon } from "./icons";
import { useScrollLock } from "./scrollLock";
import FormError from "./FormError";
import { clearChoices, DEFAULT_CHOICES, loadChoices, saveChoices, type Format } from "./reportChoices";

const FORMATS: { id: Format; label: string; mime: string; kind: string }[] = [
  { id: "docx", label: "Word (.docx)", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "Word document" },
  { id: "pdf", label: "PDF", mime: "application/pdf", kind: "PDF" },
  { id: "text", label: "Copy text", mime: "text/plain", kind: "Text" },
];
const KINDS: { id: ReportKind; label: string }[] = [
  { id: "daily", label: "Day" },
  { id: "weekly", label: "Week" },
  { id: "period", label: "Date range" },
];
/** A report longer than this is almost certainly a mistake in the dates, and would be huge with photos. */
const MAX_DAYS = 400;

const FIELDS: { key: keyof ReportDetails; label: string; placeholder: string }[] = [
  { key: "school", label: "School", placeholder: "School or company name" },
  { key: "department", label: "Department", placeholder: "e.g. College Department" },
  { key: "program", label: "Course", placeholder: "e.g. Bachelor of Science in Information Technology" },
  { key: "traineeName", label: "Name of trainee", placeholder: "Your full name" },
  { key: "term", label: "Term", placeholder: "e.g. Prelim" },
];

/** School years offered in the picker, e.g. "2026-2027": from five years back to two ahead, widened to include a saved one. */
function schoolYearOptions(saved: string): string[] {
  const thisYear = new Date().getFullYear();
  const savedStart = Number(/\d{4}/.exec(saved)?.[0]);
  const first = Math.min(thisYear - 5, savedStart || thisYear);
  const last = Math.max(thisYear + 2, savedStart || thisYear);
  return Array.from({ length: last - first + 1 }, (_, i) => `${last - i}-${last - i + 1}`);
}

type Props = {
  /** Your own entries (not archived, not reposts). */
  entries: Entry[];
  /** Dates to start the custom range with, e.g. the date filter on the logbook. */
  initialRange?: { from: string; to: string };
  onClose: () => void;
};

/**
 * Export Portfolio: one place to pick a day, a week or a date range of your logbook and get it as a Word or PDF file in
 * the layout of the school's OJT report, or as text to copy (everything, or just the descriptions).
 */
export default function ReportSheet({ entries, initialRange, onClose }: Props) {
  const s = useSession();
  const stored = useReportDetails(s.uid);
  const [details, setDetails] = useState<ReportDetails | null>(null);
  /** Day and Week can be picked together; Date range stands alone. */
  const [remembered] = useState(loadChoices);
  const [kinds, setKinds] = useState<ReportKind[]>(initialRange ? ["period"] : remembered.kinds);
  const [day, setDay] = useState(todayStr());
  const [from, setFrom] = useState(initialRange?.from || todayStr());
  const [to, setTo] = useState(initialRange?.to || todayStr());
  const [format, setFormat] = useState<Format>(remembered.format);
  const [withPhotos, setWithPhotos] = useState(remembered.withPhotos);
  const [showHours, setShowHours] = useState(remembered.showHours);
  const [descriptionsOnly, setDescriptionsOnly] = useState(remembered.descriptionsOnly);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // The saved details fill the form once; after that the form is the person's own until they save.
  useEffect(() => {
    if (stored && !details) setDetails(stored);
  }, [stored, details]);

  // Every choice is remembered on this device. Opened from a date filter, the kind stays what it was: that range is only for this once.
  useEffect(() => {
    saveChoices({ kinds: initialRange ? remembered.kinds : kinds, format, withPhotos, showHours, descriptionsOnly });
  }, [initialRange, remembered.kinds, kinds, format, withPhotos, showHours, descriptionsOnly]);

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const periodPicked = kinds.includes("period");
  const weekPicked = kinds.includes("weekly");
  const parts = kinds.map((k) => ({ kind: k, ...reportRange(k, day, from, to) }));
  // The widest report (the week, when asked for) holds every entry of the others, so it sets the summary and the photos to load.
  const range = parts.find((p) => p.kind === "weekly") ?? parts[0];
  const inRange = useMemo(() => entriesInRange(entries, range.from, range.to), [entries, range.from, range.to]);
  const emptyPart = parts.find((p) => entriesInRange(entries, p.from, p.to).length === 0);
  const photoTotal = inRange.reduce((n, e) => n + e.photoCount, 0);
  const dayCount = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 864e5) + 1;
  const rangeProblem = !range.from || !range.to ? "Pick the dates."
    : range.from > range.to ? "The From date is after the To date."
    : dayCount > MAX_DAYS ? `Pick at most ${MAX_DAYS} days.` : "";

  function toggleKind(k: ReportKind) {
    if (k === "period") { setKinds(["period"]); return; }
    const base = kinds.filter((x) => x !== "period");
    const next = base.includes(k) ? base.filter((x) => x !== k) : [...base, k];
    if (next.length > 0) setKinds(next);
  }

  function setDetail(key: keyof ReportDetails, value: string) {
    setDetails((d) => ({ ...(d ?? EMPTY_DETAILS), [key]: value }));
  }

  const copying = format === "text";
  const savedYear = details ? (/(\d{4})\D+(\d{4})/.exec(details.schoolYear)?.slice(1, 3).join("-") ?? "") : "";

  const renderField = (f: (typeof FIELDS)[number]) => (
    <label key={f.key}>{f.label}
      <input value={details![f.key]} maxLength={120} placeholder={f.placeholder} onChange={(e) => setDetail(f.key, e.target.value)} />
    </label>
  );

  async function forgetDetails() {
    setError("");
    try {
      await clearReportDetails(s.uid);
      clearChoices();
      setDetails({ ...EMPTY_DETAILS });
      setKinds(DEFAULT_CHOICES.kinds); setFormat(DEFAULT_CHOICES.format); setWithPhotos(DEFAULT_CHOICES.withPhotos);
      setShowHours(DEFAULT_CHOICES.showHours); setDescriptionsOnly(DEFAULT_CHOICES.descriptionsOnly);
      s.notify("Remembered export cleared");
    } catch (err) {
      setError(describeExportError(err).message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (rangeProblem || emptyPart) return;
    setError("");
    if (copying) {
      // Descriptions only: the widest range already holds the others' descriptions, so they are copied once.
      const wanted = descriptionsOnly ? [range] : parts;
      const text = wanted.map((p) => exportText(entries, p.kind, p.from, p.to, earliestDay(entries), descriptionsOnly)).join("\n\n\n\n");
      if (!text.trim()) { setError("There are no descriptions in these dates."); return; }
      if (await copyText(text)) s.notify(descriptionsOnly ? "Descriptions copied" : "Report copied");
      else s.manualCopy(text);
      onClose();
      return;
    }
    if (!details) return;
    try {
      // Remembered for next time, and saved first so nothing typed is lost if the export fails and the page has to be reloaded.
      saveReportDetails(s.uid, details).catch(() => {});

      const make = format === "docx" ? makeWord : makePdf;

      const photos = new Map<string, ReportImage[]>();
      if (withPhotos) {
        const withPics = inRange.filter((x) => x.photoCount > 0);
        let done = 0;
        for (const entry of withPics) {
          setBusy(`Loading photos ${done + 1} of ${withPics.length}…`);
          let list: Awaited<ReturnType<typeof loadPhotos>>;
          try { list = await loadPhotos(s.uid, entry.id); }
          catch {
            throw new ExportError(`The photos of “${entry.title}” could not be loaded. Check your connection and try again, or turn off “Include photos”.`);
          }
          const images = (await Promise.all(list.map((p) => toReportImage(p.data)))).filter((x): x is ReportImage => x !== null);
          photos.set(entry.id, images);
          done++;
        }
      }

      setBusy(`Making the ${format === "docx" ? "Word file" : "PDF"}…`);
      const f = FORMATS.find((x) => x.id === format)!;
      for (const p of parts) {
        const model = buildReport({ kind: p.kind, from: p.from, to: p.to, entries, details, photos, showHours });
        const bytes = await make(model);
        const saved = await saveFile(bytes, `${model.fileName}.${format}`, f.mime, f.kind);
        if (saved === "cancelled") { setBusy(""); return; } // closed the Save as screen: nothing went wrong
        if (saved === "failed") { setError("The file was made but could not be saved to your device. Check that there is free space and try again."); setBusy(""); return; }
      }
      s.notify(parts.length > 1 ? "Day and week reports saved" : format === "docx" ? "Word report saved" : "PDF report saved");
      onClose();
    } catch (err) {
      setError(describeExportError(err).message);
      setBusy("");
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="Export Portfolio" onSubmit={submit}>
        <div className="sheet-head">
          <h2>Export Portfolio</h2>
          <button type="button" className="icon-btn close" aria-label="Close" disabled={!!busy} onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="sheet-body">
          <fieldset className="setting">
            <legend>Export (Day and Week can be combined)</legend>
            <div className="seg">
              {KINDS.map((k) => (
                <label key={k.id} className={kinds.includes(k.id) ? "on" : ""}>
                  <input type="checkbox" checked={kinds.includes(k.id)} onChange={() => toggleKind(k.id)} />{k.label}
                </label>
              ))}
            </div>
          </fieldset>

          {periodPicked ? (
            <div className="hours-grid two">
              <label>From <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
              <label>To <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
          ) : (
            <label>{weekPicked && !kinds.includes("daily") ? "Any day in the week" : "Date"}
              <input type="date" value={day} onChange={(e) => setDay(e.target.value || todayStr())} />
            </label>
          )}
          {weekPicked && <p className="hint">{weekOfMonthShort(weekStart(day))}<br />{weekRange(day)} (Sunday to Saturday)</p>}
          <p className={rangeProblem ? "error" : "hint"} role={rangeProblem ? "alert" : undefined}>
            {rangeProblem
              || (emptyPart
                ? "No entries in these dates."
                : `${inRange.length} ${inRange.length === 1 ? "entry" : "entries"} · ${formatHM(sumMinutes(inRange))} logged${withPhotos && !copying && photoTotal > 0 ? ` · ${photoTotal} ${photoTotal === 1 ? "photo" : "photos"}` : ""}`)}
          </p>

          <fieldset className="setting">
            <legend>File type</legend>
            <div className="seg">
              {FORMATS.map((f) => (
                <label key={f.id} className={format === f.id ? "on" : ""}>
                  <input type="radio" name="format" checked={format === f.id} onChange={() => setFormat(f.id)} />{f.label}
                </label>
              ))}
            </div>
          </fieldset>

          {copying ? (
            <label className="switch-row">
              <span>Descriptions only<small>Copies just what you wrote, a heading for each week and day.</small></span>
              <input type="checkbox" role="switch" checked={descriptionsOnly} onChange={(e) => setDescriptionsOnly(e.target.checked)} />
              <i className="switch" aria-hidden="true" />
            </label>
          ) : (
            <>
              <label className="switch-row">
                <span>Include photos<small>Pictures sit beside the descriptions. Many photos make a bigger file.</small></span>
                <input type="checkbox" role="switch" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />
                <i className="switch" aria-hidden="true" />
              </label>
              <label className="switch-row">
                <span>Show hours worked<small>Adds an Hours column and a total.</small></span>
                <input type="checkbox" role="switch" checked={showHours} onChange={(e) => setShowHours(e.target.checked)} />
                <i className="switch" aria-hidden="true" />
              </label>
            </>
          )}

          {!copying && <fieldset className="setting report-details">
            <legend>Printed at the top (remembered for next time)</legend>
            {details === null ? <FieldsSkeleton count={FIELDS.length + 1} label="Loading report details" /> : <>
              {FIELDS.slice(0, 3).map(renderField)}
              <label>School year
                <select value={savedYear} onChange={(e) => setDetail("schoolYear", e.target.value)}>
                  <option value="">Not shown</option>
                  {schoolYearOptions(details.schoolYear).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              {FIELDS.slice(3).map(renderField)}
              <button type="button" className="btn small" disabled={!!busy} onClick={forgetDetails}>Clear remembered export</button>
            </>}
          </fieldset>}

          {error && (
            <FormError>
              {error}
            </FormError>
          )}
        </div>

        <div className="sheet-actions">
          <button type="button" className="btn" disabled={!!busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!!busy || !!rangeProblem || !!emptyPart || (!copying && details === null)}>
            {busy || (copying ? <><CopyIcon /> Copy</> : <><DownloadIcon /> Download</>)}
          </button>
        </div>
      </form>
    </div>
  );
}
