import { useEffect, useState } from "react";
import { longDay, todayStr } from "./report";
import { CalendarIcon, CloseIcon } from "./icons";

export type DateRange = { from: string; to: string };
export const NO_RANGE: DateRange = { from: "", to: "" };
export const rangeActive = (r: DateRange) => r.from !== "" || r.to !== "";
/** Whether a day (YYYY-MM-DD) is inside the range. An empty side is open: no From means "from the start", no To means "until now". */
export const inRange = (day: string, r: DateRange) => (!r.from || day >= r.from) && (!r.to || day <= r.to);

type FieldsProps = { value: DateRange; onChange: (r: DateRange) => void };

const addDaysTo = (date: string, n: number) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); };
/** Ready-made ranges, so the usual ones are one tap. */
const PRESETS: { label: string; range: (today: string) => DateRange }[] = [
  { label: "Today", range: (t) => ({ from: t, to: t }) },
  { label: "Last 7 days", range: (t) => ({ from: addDaysTo(t, -6), to: t }) },
  { label: "This month", range: (t) => ({ from: `${t.slice(0, 7)}-01`, to: t }) },
  { label: "Last month", range: (t) => {
    const d = new Date(`${t.slice(0, 7)}-01T00:00:00`); d.setMonth(d.getMonth() - 1);
    const first = d.toLocaleDateString("en-CA");
    return { from: first, to: addDaysTo(`${t.slice(0, 7)}-01`, -1) };
  } },
];

/** The date filter's own button, with a calendar icon. Its panel offers quick ranges and a From / To pair; either side can be left empty. */
export function DateFilterMenu({ value, onChange }: FieldsProps) {
  const [open, setOpen] = useState(false);
  const swapped = !!value.from && !!value.to && value.from > value.to;
  const today = todayStr();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="post-menu">
      <button type="button" className={`icon-btn menu-btn sort-btn${rangeActive(value) ? " filtered" : ""}`}
        aria-label={rangeActive(value) ? "Filter by date (on)" : "Filter by date"} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(!open)}><CalendarIcon /></button>
      {open && (
        <>
          <button type="button" className="menu-scrim" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="menu menu-wide date-panel" role="dialog" aria-label="Filter by date">
            <span className="menu-title">Show entries from</span>
            <div className="date-presets">
              {PRESETS.map((p) => {
                const r = p.range(today);
                const on = value.from === r.from && value.to === r.to;
                return <button key={p.label} type="button" className={`chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => onChange(r)}>{p.label}</button>;
              })}
            </div>
            <div className="date-pair">
              <label>From
                <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
              </label>
              <span className="date-arrow" aria-hidden="true">→</span>
              <label>To
                <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
              </label>
            </div>
            {swapped && <p className="error range-error" role="alert">The From date is after the To date.</p>}
            <button type="button" className="btn small" disabled={!rangeActive(value)} onClick={() => onChange(NO_RANGE)}><CloseIcon /> Reset</button>
          </div>
        </>
      )}
    </div>
  );
}

type SummaryProps = FieldsProps & { shown: number; total: number };

/** One slim line under the tabs while a date filter is on, so you can see it and clear it. Draws nothing otherwise. */
export function RangeSummary({ value, onChange, shown, total }: SummaryProps) {
  if (!rangeActive(value)) return null;
  const text = value.from && value.to ? `${longDay(value.from)} to ${longDay(value.to)}`
    : value.from ? `From ${longDay(value.from)}` : `Until ${longDay(value.to)}`;
  return (
    <div className="range-filter">
      <div className="range-top">
        <span className="range-summary">{text} · {shown} of {total}</span>
        <button type="button" className="btn small" onClick={() => onChange(NO_RANGE)}><CloseIcon /> Clear</button>
      </div>
    </div>
  );
}
