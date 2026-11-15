import { useEffect, useState } from "react";
import { describeDays, isAvailable, shiftMinutes, toMinutes, toTime, type Availability } from "./availability";
import { addDays, dayOfWeek, formatHM } from "./weeks";
import { clockTime, longDay, todayStr } from "./report";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./icons";
import { useScrollLock } from "./scrollLock";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Read-only calendar of someone's shared schedule: every day marked available or not, and tapping a day shows its details. */
export default function SharedScheduleSheet({ name, schedule: a, onClose }: { name: string; schedule: Availability; onClose: () => void }) {
  useScrollLock();
  const today = todayStr();
  const [view, setView] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [picked, setPicked] = useState(today);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const first = `${view.y}-${pad(view.m + 1)}-01`;
  const lead = dayOfWeek(first); // Sunday first
  const count = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(first, i))];
  const shift = (n: number) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const on = isAvailable(picked, a);
  const changed = a.daysOff.includes(picked) || a.daysOn.includes(picked);
  const hasTimes = !!(a.startTime && a.endTime && a.breakMinutes !== undefined);
  const mins = hasTimes ? shiftMinutes(a.startTime!, a.endTime!, a.breakMinutes!) : a.hoursPerDay * 60;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`${name}'s schedule`}>
        <div className="sheet-head">
          <h2>{name}’s schedule</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <section className="daily-schedule" aria-label="Daily schedule">
            <h3>Daily schedule</h3>
            <p>
              {a.workDays.length ? <b>{describeDays(a.workDays)}</b> : <b>No set days</b>}
              {hasTimes ? <> · {clockTime(a.startTime!)} to {clockTime(a.endTime!)}</> : null}
            </p>
            <p>{formatHM(mins)} a day{hasTimes ? (a.breakMinutes ? ` · ${a.breakMinutes} min break` : " · no break") : ""}</p>
            {a.breakAt && a.breakMinutes ? <p>Break {clockTime(a.breakAt)} to {clockTime(toTime(toMinutes(a.breakAt) + a.breakMinutes))}</p> : null}
          </section>
          <div className="cal-head">
            <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeftIcon /></button>
            <b>{new Date(view.y, view.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b>
            <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}><ChevronRightIcon /></button>
          </div>
          <div className="cal-grid" role="grid">
            {DOW.map((d) => <span key={d} className="cal-dow" aria-hidden="true">{d}</span>)}
            {cells.map((date, i) => date === null ? <span key={`e${i}`} /> : (
              <button key={date} type="button"
                className={`cal-day ${isAvailable(date, a) ? "avail" : "off"}${a.daysOff.includes(date) || a.daysOn.includes(date) ? " changed" : ""}${date === today ? " today" : ""}${date === picked ? " picked" : ""}`}
                aria-pressed={date === picked}
                aria-label={`${longDay(date)}: ${isAvailable(date, a) ? "available" : "unavailable"}`}
                onClick={() => setPicked(date)}>{Number(date.slice(8))}</button>
            ))}
          </div>
          <ul className="cal-legend">
            <li><i className="cal-key avail" /> Available</li>
            <li><i className="cal-key off" /> Unavailable</li>
            <li><i className="cal-key avail changed" /> Different from the usual week</li>
          </ul>
          <section className="day-detail" aria-live="polite">
            <h3>{longDay(picked)}{picked === today ? " (today)" : ""}</h3>
            <p>
              {on
                ? <><b>Available</b>{hasTimes ? <> · {clockTime(a.startTime!)} to {clockTime(a.endTime!)}{a.breakMinutes ? `, ${a.breakMinutes} min break` : ""}</> : null} · {formatHM(mins)}</>
                : <b>Not available</b>}
            </p>
            {changed && <p className="hint">{on ? "Working a day that is usually off." : "A day off that is usually a work day."}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
