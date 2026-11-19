import TimeField from "./TimeField";
import { useEffect, useState, type FormEvent } from "react";
import { addEntry, updateEntryHours, type Entry } from "./entries";
import { clockTime, longDay, todayStr } from "./report";
import { formatHM, spanMinutes } from "./weeks";
import { useSession } from "./session";
import { CloseIcon } from "./icons";
import { useScrollLock } from "./scrollLock";
import FormError from "./FormError";

const MAX_BREAK = 600;

/**
 * Add hours for a day you forgot to clock in: the date, when you started and finished, and how long your break was.
 * The break is taken out of the shift. It is saved as an hours-only entry, exactly like one saved by Clock out.
 */
export default function PastHoursSheet({ defaultBreak = 0, entry, onClose }: { defaultBreak?: number; /** edit the hours of this logged entry instead of adding new ones */ entry?: Entry; onClose: () => void }) {
  const s = useSession();
  useScrollLock();
  const [date, setDate] = useState(entry?.date ?? "");
  const [from, setFrom] = useState(entry?.clockIn ?? "");
  const [to, setTo] = useState(entry?.clockOut ?? "");
  const [breakMin, setBreakMin] = useState(String(entry ? entry.breakMinutes ?? 0 : defaultBreak || 0));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const brk = Math.max(0, Math.floor(Number(breakMin) || 0));
  const span = from && to ? spanMinutes(from, to) : 0;
  const net = Math.max(0, span - brk);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!date || !from || !to) return setError("Fill in the date, time in and time out.");
    if (date > todayStr()) return setError("Pick today or a day that has passed.");
    if (from === to) return setError("Time out must be different from time in.");
    if (brk > MAX_BREAK || brk >= span) return setError("The break has to be shorter than the shift.");
    if (new Date(`${date}T${to < from ? from : to}`).getTime() > Date.now() && to >= from) return setError("Time out cannot be in the future.");
    setBusy(true);
    try {
      if (entry) {
        await updateEntryHours(s.uid, entry, { date, clockIn: from, clockOut: to, breakMinutes: brk });
        s.notify("Hours updated");
        onClose();
        return;
      }
      await addEntry(s.uid, {
        date, time: from, clockIn: from, clockOut: to, ...(brk > 0 ? { breakMinutes: brk } : {}),
        title: "Hours logged", description: "", skills: [], visibility: "private", groupIds: [], videoUrl: "", hoursOnly: true,
      }, []);
      s.notify(`${formatHM(net)} added for ${longDay(date)}`);
      onClose();
    } catch (err) {
      setError((err as Error).message || "Could not save the hours. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={entry ? "Edit hours" : "Add hours for a past date"} onSubmit={submit}>
        <div className="sheet-head">
          <h2>{entry ? "Edit hours" : "Add past hours"}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" disabled={busy} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <p className="hint">{entry ? "Change the day, time in, time out or break. The entry itself is not touched." : "Forgot to clock in? Add the shift here. The break is taken out."}</p>
          <label>Date
            <input type="date" value={date} max={todayStr()} required onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="row">
            <label>Time in
              <TimeField value={from} required onChange={(v) => setFrom(v)} />
            </label>
            <label>Time out
              <TimeField value={to} required onChange={(v) => setTo(v)} />
            </label>
          </div>
          <label>Break (minutes)
            <input type="number" inputMode="numeric" min={0} max={MAX_BREAK} step={5} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} />
          </label>
          {span > 0 && (
            <p className="hint past-total" role="status">
              {clockTime(from)} – {clockTime(to)}{to < from ? " (next day)" : ""} · {formatHM(span)}{brk > 0 ? ` − ${formatHM(brk)} break` : ""} = <b>{formatHM(net)}</b> counted
            </p>
          )}
          {error && <FormError>{error}</FormError>}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : entry ? "Save hours" : "Add hours"}</button>
        </div>
      </form>
    </div>
  );
}
