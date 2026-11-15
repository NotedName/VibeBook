import { useMemo, useState } from "react";
import type { Entry } from "./entries";
import { isAvailable, type Availability } from "./availability";
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
  availability: Availability;
  onEdit: (entry: Entry) => void;
  /** Opens a new entry for this day. */
  onAdd: (date: string) => void;
};

/**
 * The logbook as a month: days with entries are filled and say how many, workdays since your first entry that have nothing logged are
 * outlined in orange, today is ringed. Tapping a day shows its entries underneath, with a way to add one for that day.
 */
export default function LogbookMonth({ entries, availability, onEdit, onAdd }: Props) {
  const today = todayStr();
  const [view, setView] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [picked, setPicked] = useState("");

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
          const missed = n === 0 && first !== "" && date >= first && date < today && isAvailable(date, availability);
          const cls = ["lm-day", n > 0 && "has", missed && "missed", date === today && "today", date === picked && "picked"].filter(Boolean).join(" ");
          return (
            <button key={date} type="button" className={cls} aria-pressed={date === picked} aria-current={date === today ? "date" : undefined}
              aria-label={`${longDay(date)}${n > 0 ? `, ${plural(n, "entry", "entries")}` : missed ? ", nothing logged" : ""}`}
              onClick={() => setPicked(date === picked ? "" : date)}>
              <b>{Number(date.slice(8))}</b>
              {n > 0 && <small>{plural(n, "entry", "entries")}</small>}
            </button>
          );
        })}
      </div>
      <p className="hint">Orange days are workdays with nothing logged. Tap a day to see or add entries.</p>

      {picked && (
        <div className="lm-day-panel">
          <div className="lm-day-title">
            <h2>{longDay(picked)}</h2>
            <button type="button" className="btn small primary" onClick={() => onAdd(picked)}>Add entry</button>
          </div>
          {pickedEntries.length === 0 ? <p className="hint">Nothing logged on this day.</p> : <EntryList entries={pickedEntries} onEdit={onEdit} dayHeadings={false} />}
        </div>
      )}
    </section>
  );
}
