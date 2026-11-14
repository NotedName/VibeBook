import { useState } from "react";
import { longDay } from "./report";
import { CloseIcon } from "./icons";

export type DateRange = { from: string; to: string };
export const NO_RANGE: DateRange = { from: "", to: "" };
export const rangeActive = (r: DateRange) => r.from !== "" || r.to !== "";
/** Whether a day (YYYY-MM-DD) is inside the range. An empty side is open: no From means "from the start", no To means "until now". */
export const inRange = (day: string, r: DateRange) => (!r.from || day >= r.from) && (!r.to || day <= r.to);

type Props = { value: DateRange; onChange: (r: DateRange) => void; shown: number; total: number };

/** Show only the days between two dates. Either side can be left empty. */
export default function DateRangeFilter({ value, onChange, shown, total }: Props) {
  const [open, setOpen] = useState(rangeActive(value));
  const active = rangeActive(value);
  const swapped = !!value.from && !!value.to && value.from > value.to;
  const summary = value.from && value.to ? `${longDay(value.from)} to ${longDay(value.to)}`
    : value.from ? `From ${longDay(value.from)}` : value.to ? `Until ${longDay(value.to)}` : "";

  return (
    <div className="range-filter">
      <div className="range-top">
        <button type="button" className={`btn small${open || active ? " on" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          Filter by date
        </button>
        {active && <span className="range-summary">{summary} · {shown} of {total}</span>}
      </div>
      {open && (
        <div className="range-fields">
          <label>From
            <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </label>
          <label>To
            <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </label>
          {active && (
            <button type="button" className="btn small" onClick={() => onChange(NO_RANGE)}><CloseIcon /> Clear</button>
          )}
          {swapped && <p className="error range-error" role="alert">The From date is after the To date.</p>}
        </div>
      )}
    </div>
  );
}
