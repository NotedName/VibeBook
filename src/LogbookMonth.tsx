import { useMemo, useState } from "react";
import type { Entry } from "./entries";
import { holidayOn, isAvailable, type Availability } from "./availability";
import { longDay, todayStr } from "./report";
import { addDays, dayOfWeek, earliestDay } from "./weeks";
import EntryList from "./EntryList";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const pad = (n: number) => String(n).padStart(2, "0");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Props = {
  /** Your logbook entries (not archived, not hours-only). */
  entries: Entry[];
  /** Your own days of work; left out for someone else's logbook (no orange "nothing logged" days). */
  availability?: Availability;
  onEdit?: (entry: Entry) => void;
  /** Opens a new entry for this day. Left out for someone else's logbook. */
  onAdd?: (date: string) => void;
  /** Marks a day as a day off (a holiday or an absence) with its reason, or clears the mark when the reason is null. Your own logbook only. */
  onMarkDay?: (date: string, reason: string | null) => Promise<void>;
};

/**
 * The logbook as a month: days with entries are filled and say how many, workdays since your first entry that have nothing logged are
 * outlined in orange, today is ringed. Tapping a day shows its entries underneath, with a way to add one for that day.
 */
export default function LogbookMonth({ entries, availability, onEdit, onAdd, onMarkDay }: Props) {
  const today = todayStr();
  const [view, setView] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [picked, setPicked] = useState("");
  const [reason, setReason] = useState<"Holiday" | "Absent">("Holiday");
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState("");

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    entries.forEach((e) => map.set(e.date, [...(map.get(e.date) ?? []), e]));
    return map;
  }, [entries]);
  const first = earliestDay(entries);

  const start = `${view.y}-${pad(view.m + 1)}-01`;
  const count = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array<null>(dayOfWeek(start)).fill(null), ...Array.from({ length: count }, (_, i) => addDays(start, i))];
  const monthPrefix = start.slice(0, 7);
  const monthEntries = entries.filter((e) => e.date.startsWith(monthPrefix)).length;
  const shift = (n: number) => { const d = new Date(view.y, view.m + n, 1); setView({ y: d.getFullYear(), m: d.getMonth() }); setPicked(""); };

  const pickedEntries = picked ? byDay.get(picked) ?? [] : [];
  const pickedOff = picked && availability ? holidayOn(picked, availability) : undefined;
  const pickedMissed = !!picked && pickedEntries.length === 0 && !!availability && first !== "" && picked >= first && picked < today && isAvailable(picked, availability);
  async function mark(next: string | null) {
    if (!onMarkDay) return;
    setMarking(true); setMarkError("");
    try { await onMarkDay(picked, next); } catch (e) { setMarkError((e as Error).message || "Could not save. Try again."); }
    setMarking(false);
  }

  return (
    <section className="lm" aria-label="Month view">
      <p className="lm-total">{plural(entries.length, "entry", "entries")} · {plural(byDay.size, "day", "days")}</p>
      <div className="lm-head">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeftIcon /></button>
        <div>
          <b>{new Date(view.y, view.m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b>
          <span>{plural(monthEntries, "entry", "entries")}</span>
        </div>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}><ChevronRightIcon /></button>
      </div>
      <div className="lm-grid">
        {DOW.map((d) => <span key={d} className="lm-dow">{d}</span>)}
        {cells.map((date, i) => {
          if (!date) return <span key={`gap${i}`} />;
          const n = byDay.get(date)?.length ?? 0;
          const missed = n === 0 && first !== "" && date >= first && date < today && !!availability && isAvailable(date, availability);
          const off = !!availability && !!holidayOn(date, availability);
          const cls = ["lm-day", n > 0 && "has", missed && "missed", off && n === 0 && "dayoff", date === today && "today", date === picked && "picked"].filter(Boolean).join(" ");
          return (
            <button key={date} type="button" className={cls} aria-pressed={date === picked} aria-current={date === today ? "date" : undefined}
              aria-label={`${longDay(date)}${n > 0 ? `, ${plural(n, "entry", "entries")}` : missed ? ", nothing logged" : off ? ", day off" : ""}`}
              onClick={() => setPicked(date === picked ? "" : date)}>
              <b>{Number(date.slice(8))}</b>
              {n > 0 && <small>{plural(n, "entry", "entries")}</small>}
              {off && n === 0 && <small>{holidayOn(date, availability!)?.name || "Off"}</small>}
            </button>
          );
        })}
      </div>
      <p className="hint">{availability ? "Orange days are workdays with nothing logged. Tap a day to see or add entries." : "Tap a day to see its entries."}</p>

      {picked && (
        <div className="lm-day-panel">
          <div className="lm-day-title">
            <h2>{longDay(picked)}</h2>
            {onAdd && <button type="button" className="btn small primary" onClick={() => onAdd(picked)}>Add entry</button>}
          </div>
          {pickedMissed && (
            <div className="lm-missed" role="status">
              <b>No entry for this day.</b>
              <span>It is one of your workdays. Add an entry for it, or mark it as a day off.</span>
              {onMarkDay && (
                <div className="lm-markoff">
                  <div className="seg" role="radiogroup" aria-label="Reason for the day off">
                    {(["Holiday", "Absent"] as const).map((r) => (
                      <label key={r} className={reason === r ? "on" : ""}><input type="radio" name="dayoff" checked={reason === r} onChange={() => setReason(r)} />{r.toLowerCase()}</label>
                    ))}
                  </div>
                  <button type="button" className="btn" disabled={marking} onClick={() => void mark(reason)}>{marking ? "Saving…" : "Mark as day off"}</button>
                </div>
              )}
            </div>
          )}
          {pickedOff && pickedEntries.length === 0 && (
            <div className="lm-missed off" role="status">
              <b>Day off · {pickedOff.name || "marked"}</b>
              <span>This day does not count as a missed workday.</span>
              {onMarkDay && <button type="button" className="btn" disabled={marking} onClick={() => void mark(null)}>{marking ? "Saving…" : "Undo day off"}</button>}
            </div>
          )}
          {markError && <p className="error" role="alert">{markError}</p>}
          {pickedEntries.length === 0 ? (!pickedMissed && !pickedOff && <p className="hint">Nothing logged on this day.</p>) : <EntryList entries={pickedEntries} onEdit={onEdit} dayHeadings={false} />}
        </div>
      )}
    </section>
  );
}
