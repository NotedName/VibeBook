import { useEffect, useState } from "react";
import { cleanExceptions, defaultTimes, isAvailable, isTime, MAX_EXCEPTIONS, shiftMinutes, toggleDate, type Availability } from "./availability";
import { saveAvailability } from "./hours";
import { todayStr } from "./report";
import { addDays, dayOfWeek, formatHM } from "./weeks";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./icons";
import { useScrollLock } from "./scrollLock";
import FormError from "./FormError";

/** Sunday first, as the weeks in the logbook run. */
const WEEK: { day: number; short: string; long: string }[] = [
  { day: 0, short: "Sun", long: "Sunday" }, { day: 1, short: "Mon", long: "Monday" }, { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" }, { day: 4, short: "Thu", long: "Thursday" }, { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
];

const WEEK_ERROR = "Pick at least one day you can work.";
const TIME_ERRORS = ["Set when your day starts and ends.", "Break must be a whole number of minutes.", "The end time must come after the start time, with the break taken out."];

const pad = (n: number) => String(n).padStart(2, "0");
const monthStart = (y: number, m: number) => `${y}-${pad(m + 1)}-01`;

type Props = { uid: string; value: Availability; /** the schedule is shown to other people */ share: boolean; onClose: () => void };

/**
 * Choose which days you can work. The usual week (say Monday to Friday) sets the pattern, and the calendar lets you
 * change single dates: mark a holiday or an absence unavailable, or a Saturday you will work available.
 */
export default function AvailabilitySheet({ uid, value, share, onClose }: Props) {
  const [a, setA] = useState<Availability>(value);
  const [times, setTimes] = useState(() => {
    const t = value.startTime && value.endTime && value.breakMinutes !== undefined
      ? { startTime: value.startTime, endTime: value.endTime, breakMinutes: value.breakMinutes }
      : defaultTimes(value.hoursPerDay);
    return { start: t.startTime, end: t.endTime, brk: String(t.breakMinutes) };
  });
  const today = todayStr();
  const [view, setView] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleWeekday = (day: number) =>
    setA((cur) => ({ ...cur, workDays: cur.workDays.includes(day) ? cur.workDays.filter((d) => d !== day) : [...cur.workDays, day] }));

  const first = monthStart(view.y, view.m);
  const lead = dayOfWeek(first); // empty cells before the 1st, Sunday first
  const count = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(first, i))];
  const shift = (n: number) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const exceptions = a.daysOff.length + a.daysOn.length;
  const dayMinutes = shiftMinutes(times.start, times.end, Number(times.brk) || 0);

  async function save() {
    const brk = Number(times.brk);
    if (!isTime(times.start) || !isTime(times.end)) { setError("Set when your day starts and ends."); return; }
    if (!Number.isInteger(brk) || brk < 0) { setError("Break must be a whole number of minutes."); return; }
    if (dayMinutes <= 0) { setError("The end time must come after the start time, with the break taken out."); return; }
    const clean = cleanExceptions({ ...a, hoursPerDay: dayMinutes / 60, startTime: times.start, endTime: times.end, breakMinutes: brk });
    if (clean.workDays.length === 0 && clean.daysOn.length === 0) { setError(WEEK_ERROR); return; }
    setBusy(true);
    setError("");
    try { await saveAvailability(uid, clean, share); onClose(); }
    catch (err) { setError((err as Error).message || "Could not save. Try again."); setBusy(false); }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Available days">
        <div className="sheet-head">
          <h2>Available days</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="sheet-body">
          <p className="hint">Used to work out when you will reach your required hours. Hours already logged never change.</p>

          <fieldset className="setting">
            <legend>Usual week</legend>
            <div className="day-chips">
              {WEEK.map((d) => (
                <button key={d.day} type="button" className={`day-chip${a.workDays.includes(d.day) ? " on" : ""}`}
                  aria-pressed={a.workDays.includes(d.day)} aria-label={`${d.long}: ${a.workDays.includes(d.day) ? "available" : "unavailable"}`}
                  onClick={() => toggleWeekday(d.day)}>{d.short}</button>
              ))}
            </div>
            {error === WEEK_ERROR && <FormError>{error}</FormError>}
          </fieldset>

          <fieldset className="setting">
            <legend>Daily schedule</legend>
            <div className="time-row">
              <label>From
                <input type="time" value={times.start} onChange={(e) => setTimes((t) => ({ ...t, start: e.target.value }))} />
              </label>
              <label>To
                <input type="time" value={times.end} onChange={(e) => setTimes((t) => ({ ...t, end: e.target.value }))} />
              </label>
              <label>Break (min)
                <input type="number" inputMode="numeric" min="0" step="5" value={times.brk} onChange={(e) => setTimes((t) => ({ ...t, brk: e.target.value }))} />
              </label>
            </div>
            <p className="hint">{dayMinutes > 0 ? <>Counts as <b>{formatHM(dayMinutes)}</b> a day</> : "The end must come after the start."}</p>
            {TIME_ERRORS.includes(error) && <FormError>{error}</FormError>}
          </fieldset>

          <fieldset className="setting">
            <legend>Change single dates</legend>
            <div className="cal-head">
              <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeftIcon /></button>
              <b>{new Date(view.y, view.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b>
              <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}><ChevronRightIcon /></button>
            </div>
            <div className="cal-grid" role="grid">
              {WEEK.map((d) => <span key={d.day} className="cal-dow" aria-hidden="true">{d.short.slice(0, 2)}</span>)}
              {cells.map((date, i) => date === null ? <span key={`e${i}`} /> : (
                <button key={date} type="button"
                  className={`cal-day ${isAvailable(date, a) ? "avail" : "off"}${a.daysOff.includes(date) || a.daysOn.includes(date) ? " changed" : ""}${date === today ? " today" : ""}`}
                  aria-pressed={isAvailable(date, a)}
                  aria-label={`${date}: ${isAvailable(date, a) ? "available" : "unavailable"}`}
                  onClick={() => setA((cur) => toggleDate(date, cur))}>{Number(date.slice(8))}</button>
              ))}
            </div>
            <ul className="cal-legend">
              <li><i className="cal-key avail" /> Available</li>
              <li><i className="cal-key off" /> Unavailable</li>
              <li><i className="cal-key avail changed" /> Changed by you</li>
            </ul>
            <p className="hint">Tap a date to switch it, e.g. a holiday or a Saturday you will work.
              {exceptions > 0 && <> {exceptions} {exceptions === 1 ? "date" : "dates"} changed ({MAX_EXCEPTIONS} at most). <button type="button" className="link-btn" onClick={() => setA((cur) => ({ ...cur, daysOff: [], daysOn: [] }))}>Clear all changes</button></>}
            </p>
          </fieldset>

          {error && error !== WEEK_ERROR && !TIME_ERRORS.includes(error) && <FormError>{error}</FormError>}
        </div>

        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
