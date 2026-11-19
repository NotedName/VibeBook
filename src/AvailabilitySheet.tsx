import TimeField from "./TimeField";
import { useEffect, useState } from "react";
import { addHolidays, cleanExceptions, defaultTimes, HOLIDAY_NAME_MAX, holidayOn, isAvailable, isTime, removeHoliday, shiftMinutes, toggleDate, toMinutes, toTime, type Availability } from "./availability";
import { MAX_REQUIRED_HOURS, saveAvailability, setRequiredHours } from "./hours";
import { clockTime, longDay, todayStr } from "./report";
import { addDays, dayOfWeek, daysBetween, formatHM } from "./weeks";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon } from "./icons";
import { useScrollLock } from "./scrollLock";
import FormError from "./FormError";

/** Sunday first, as the weeks in the logbook run. */
const WEEK: { day: number; short: string; long: string }[] = [
  { day: 0, short: "Sun", long: "Sunday" }, { day: 1, short: "Mon", long: "Monday" }, { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" }, { day: 4, short: "Thu", long: "Thursday" }, { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
];

const HOLIDAY_ERROR_PREFIX = "Holiday: ";
const MAX_HOLIDAY_DAYS = 31;
/** Holidays that fall on the same date every year; the next one coming up is added. Others (Chinese New Year, Eid, ...) move, so add those by date. */
const FIXED_HOLIDAYS: { name: string; month: number; day: number }[] = [
  { name: "New Year's Day", month: 1, day: 1 }, { name: "Labour Day", month: 5, day: 1 }, { name: "Christmas Day", month: 12, day: 25 },
];
const nextOccurrence = (month: number, day: number, from: string) => {
  const y = Number(from.slice(0, 4));
  const d = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return d >= from ? d : `${y + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const WEEK_ERROR = "Pick at least one day you can work.";
const GOAL_ERROR = `Enter the hours as a number from 1 to ${MAX_REQUIRED_HOURS}, or leave it empty to remove the goal.`;
/** Quick choices for the length of the break and when it starts. */
const BREAK_PRESETS = [0, 15, 30, 45, 60, 90];
const START_PRESETS = ["12:00", "12:30", "13:00"];
const BREAK_ERROR_LEN = "Set how long the break is, or clear its start time.";
const BREAK_ERROR_SPAN = "The whole break must fall between your start and end times.";
const TIME_ERRORS = ["Set when your day starts and ends.", "Break must be a whole number of minutes.", "The end time must come after the start time, with the break taken out.", BREAK_ERROR_LEN, BREAK_ERROR_SPAN];

const pad = (n: number) => String(n).padStart(2, "0");
const monthStart = (y: number, m: number) => `${y}-${pad(m + 1)}-01`;

type Props = { uid: string; /** hours required, null when no goal is set */ hours: number | null; value: Availability; /** the schedule is shown to other people */ share: boolean; onClose: () => void };

/**
 * Edit the hours you are required to work and which days you can work. The usual week (say Monday to Friday) sets the pattern, and the calendar lets you
 * change single dates: mark a holiday or an absence unavailable, or a Saturday you will work available.
 */
export default function AvailabilitySheet({ uid, hours, value, share, onClose }: Props) {
  const [a, setA] = useState<Availability>(value);
  const [goalText, setGoalText] = useState(hours === null ? "" : String(hours));
  const [times, setTimes] = useState(() => {
    const t = value.startTime && value.endTime && value.breakMinutes !== undefined
      ? { startTime: value.startTime, endTime: value.endTime, breakMinutes: value.breakMinutes }
      : defaultTimes(value.hoursPerDay);
    return { start: t.startTime, end: t.endTime, brk: String(t.breakMinutes), at: value.breakAt ?? "" };
  });
  const breakMin = Number(times.brk) || 0;
  /** "Other" is open, or the saved break is not one of the quick choices. */
  const [otherBreak, setOtherBreak] = useState(() => !BREAK_PRESETS.includes(Number(times.brk)));
  const today = todayStr();
  const [view, setView] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hName, setHName] = useState("");
  const [hFrom, setHFrom] = useState("");
  const [hTo, setHTo] = useState("");

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

  /** Adds a holiday for one date or a run of dates; each one becomes unavailable on its own. */
  function addHoliday(name: string, from: string, to: string) {
    const end = to || from;
    if (!from) { setError(`${HOLIDAY_ERROR_PREFIX}pick the date it starts.`); return; }
    if (from < today) { setError(`${HOLIDAY_ERROR_PREFIX}pick today or a day to come.`); return; }
    if (end < from) { setError(`${HOLIDAY_ERROR_PREFIX}the last day cannot be before the first.`); return; }
    const dates = daysBetween(from, end);
    if (dates.length > MAX_HOLIDAY_DAYS) { setError(`${HOLIDAY_ERROR_PREFIX}up to ${MAX_HOLIDAY_DAYS} days at a time.`); return; }
    setError("");
    setA((cur) => addHolidays(cur, dates, name.trim() || "Holiday"));
    setView({ y: Number(from.slice(0, 4)), m: Number(from.slice(5, 7)) - 1 }); // show where it landed
    setHName(""); setHFrom(""); setHTo("");
  }
  const holidays = (a.holidays ?? []).filter((h) => h.date >= today).sort((x, y) => x.date.localeCompare(y.date));

  async function save() {
    const goal = Number(goalText.replace(",", "."));
    if (goalText.trim() !== "" && (!Number.isFinite(goal) || goal < 0 || goal > MAX_REQUIRED_HOURS)) { setError(GOAL_ERROR); return; }
    const brk = Number(times.brk);
    if (!isTime(times.start) || !isTime(times.end)) { setError("Set when your day starts and ends."); return; }
    if (!Number.isInteger(brk) || brk < 0) { setError("Break must be a whole number of minutes."); return; }
    if (dayMinutes <= 0) { setError("The end time must come after the start time, with the break taken out."); return; }
    if (times.at) {
      if (brk <= 0) { setError(BREAK_ERROR_LEN); return; }
      if (!isTime(times.at) || toMinutes(times.at) < toMinutes(times.start) || toMinutes(times.at) + brk > toMinutes(times.end)) { setError(BREAK_ERROR_SPAN); return; }
    }
    const { breakAt: _old, ...rest } = a;
    const clean = cleanExceptions({ ...rest, hoursPerDay: dayMinutes / 60, startTime: times.start, endTime: times.end, breakMinutes: brk, ...(times.at ? { breakAt: times.at } : {}) });
    if (clean.workDays.length === 0 && clean.daysOn.length === 0) { setError(WEEK_ERROR); return; }
    setBusy(true);
    setError("");
    try { await saveAvailability(uid, clean, share); await setRequiredHours(uid, goalText.trim() === "" ? 0 : goal); onClose(); }
    catch (err) { setError((err as Error).message || "Could not save. Try again."); setBusy(false); }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Edit hours">
        <div className="sheet-head">
          <h2>Edit hours</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="sheet-body">
          <p className="hint">Used to work out when you will reach your required hours. Hours already logged never change.</p>

          <fieldset className="setting">
            <legend>Hours required</legend>
            <input type="number" inputMode="decimal" min="0" max={MAX_REQUIRED_HOURS} step="0.5" aria-label="Hours required"
              value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="e.g. 486" />
            {error === GOAL_ERROR && <FormError>{error}</FormError>}
          </fieldset>

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
            <div className="time-row two">
              <label><span className="cap">From</span>
                <TimeField value={times.start} onChange={(v) => setTimes((t) => ({ ...t, start: v }))} />
              </label>
              <label><span className="cap">To</span>
                <TimeField value={times.end} onChange={(v) => setTimes((t) => ({ ...t, end: v }))} />
              </label>
            </div>

            <span className="cap">Break</span>
            <div className="opt-chips" role="group" aria-label="Break length">
              {BREAK_PRESETS.map((m) => (
                <button key={m} type="button" className={`opt-chip${!otherBreak && breakMin === m ? " on" : ""}`} aria-pressed={!otherBreak && breakMin === m}
                  onClick={() => { setOtherBreak(false); setTimes((t) => ({ ...t, brk: String(m), at: m === 0 ? "" : t.at })); }}>
                  {m === 0 ? "No break" : `${m} min`}
                </button>
              ))}
              <button type="button" className={`opt-chip${otherBreak ? " on" : ""}`} aria-pressed={otherBreak} onClick={() => setOtherBreak(true)}>Other</button>
            </div>
            {otherBreak && (
              <label><span className="cap">Break length (minutes)</span>
                <input type="number" inputMode="numeric" min="0" step="5" value={times.brk} onChange={(e) => setTimes((t) => ({ ...t, brk: e.target.value }))} />
              </label>
            )}

            {breakMin > 0 && (
              <>
                <span className="cap">Break starts</span>
                <div className="opt-chips" role="group" aria-label="When the break starts">
                  <button type="button" className={`opt-chip${times.at === "" ? " on" : ""}`} aria-pressed={times.at === ""} onClick={() => setTimes((t) => ({ ...t, at: "" }))}>I choose each day</button>
                  {START_PRESETS.map((t) => (
                    <button key={t} type="button" className={`opt-chip${times.at === t ? " on" : ""}`} aria-pressed={times.at === t} onClick={() => setTimes((x) => ({ ...x, at: t }))}>{clockTime(t)}</button>
                  ))}
                </div>
                <label><span className="cap">Or pick a time</span>
                  <TimeField value={times.at} onChange={(v) => setTimes((t) => ({ ...t, at: v }))} />
                </label>
              </>
            )}

            <p className="hint">{dayMinutes > 0 ? <>Counts as <b>{formatHM(dayMinutes)}</b> a day.</> : "The end must come after the start."}{" "}
              {breakMin > 0 && (times.at && isTime(times.at)
                ? <>The break from <b>{clockTime(times.at)}</b> to <b>{clockTime(toTime(toMinutes(times.at) + breakMin))}</b> is taken out by itself while you are clocked in.</>
                : "Tap Break time when you take it and those minutes are taken out.")}</p>
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
                  className={`cal-day ${isAvailable(date, a) ? "avail" : "off"}${holidayOn(date, a) ? " holiday" : a.daysOff.includes(date) || a.daysOn.includes(date) ? " changed" : ""}${date === today ? " today" : ""}`}
                  aria-pressed={isAvailable(date, a)} title={holidayOn(date, a)?.name}
                  aria-label={`${date}: ${holidayOn(date, a) ? `${holidayOn(date, a)!.name}, ` : ""}${isAvailable(date, a) ? "available" : "unavailable"}`}
                  onClick={() => setA((cur) => removeHoliday(toggleDate(date, cur), date))}>{Number(date.slice(8))}</button>
              ))}
            </div>
            <ul className="cal-legend">
              <li><i className="cal-key avail" /> Available</li>
              <li><i className="cal-key off" /> Unavailable</li>
              <li><i className="cal-key avail changed" /> Changed by you</li>
              <li><i className="cal-key off holiday" /> Holiday</li>
            </ul>
            <p className="hint">Tap a date to switch it, e.g. a holiday or a Saturday you will work.
              {exceptions > 0 && <> {exceptions} {exceptions === 1 ? "date" : "dates"} changed. <button type="button" className="link-btn" onClick={() => setA((cur) => ({ ...cur, daysOff: [], daysOn: [] }))}>Clear all changes</button></>}
            </p>
            <p className="hint">A date you change stays marked, past days too, so you can see every day you were off.</p>
          </fieldset>

          <fieldset className="setting">
            <legend>Holidays</legend>
            <p className="hint">Holidays are marked unavailable on the calendar by themselves, so they are left out of your finish date and weekly hours.</p>
            <div className="holiday-quick" role="group" aria-label="Common holidays">
              {FIXED_HOLIDAYS.map((h) => {
                const date = nextOccurrence(h.month, h.day, today);
                const on = holidays.some((x) => x.date === date);
                return (
                  <button key={h.name} type="button" className={`chip-btn${on ? " on" : ""}`} aria-pressed={on} title={longDay(date)}
                    onClick={() => (on ? setA((cur) => removeHoliday(cur, date)) : addHoliday(h.name, date, date))}>{h.name}</button>
                );
              })}
            </div>
            <form className="holiday-form" onSubmit={(e) => { e.preventDefault(); addHoliday(hName, hFrom, hTo); }}>
              <label><span className="cap">Name <small>(optional)</small></span>
                <input value={hName} maxLength={HOLIDAY_NAME_MAX} placeholder="e.g. Hari Raya" onChange={(e) => setHName(e.target.value)} />
              </label>
              <div className="time-row">
                <label><span className="cap">From</span>
                  <input type="date" value={hFrom} min={today} onChange={(e) => { setHFrom(e.target.value); if (hTo && e.target.value > hTo) setHTo(""); }} />
                </label>
                <label><span className="cap">To <small>(optional)</small></span>
                  <span className="input-clear">
                    <input type="date" value={hTo} min={hFrom || today} onChange={(e) => setHTo(e.target.value)} />
                    {hTo && <button type="button" className="icon-btn clear-btn" aria-label="Clear last day" title="Clear last day" onClick={() => setHTo("")}><CloseIcon /></button>}
                  </span>
                </label>
              </div>
              <button type="submit" className="btn"><PlusIcon />Add holiday</button>
            </form>
            {error.startsWith(HOLIDAY_ERROR_PREFIX) && <FormError>{error.slice(HOLIDAY_ERROR_PREFIX.length).replace(/^./, (c) => c.toUpperCase())}</FormError>}
            {holidays.length > 0 && (
              <ul className="holiday-list">
                {holidays.map((h) => (
                  <li key={h.date}>
                    <i><CalendarIcon /></i>
                    <span>{h.name}<small>{longDay(h.date)}</small></span>
                    <button type="button" className="icon-btn" aria-label={`Remove ${h.name}, ${longDay(h.date)}`} onClick={() => setA((cur) => removeHoliday(cur, h.date))}><CloseIcon /></button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {error && error !== WEEK_ERROR && error !== GOAL_ERROR && !TIME_ERRORS.includes(error) && !error.startsWith(HOLIDAY_ERROR_PREFIX) && <FormError>{error}</FormError>}
        </div>

        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
