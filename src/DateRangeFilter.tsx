import { longDay } from "./report";
import { CloseIcon } from "./icons";

export type DateRange = { from: string; to: string };
export const NO_RANGE: DateRange = { from: "", to: "" };
export const rangeActive = (r: DateRange) => r.from !== "" || r.to !== "";
/** Whether a day (YYYY-MM-DD) is inside the range. An empty side is open: no From means "from the start", no To means "until now". */
export const inRange = (day: string, r: DateRange) => (!r.from || day >= r.from) && (!r.to || day <= r.to);

type FieldsProps = { value: DateRange; onChange: (r: DateRange) => void };

/** The two date inputs, shown inside the sort menu. Either side can be left empty. */
export function DateRangeFields({ value, onChange }: FieldsProps) {
  const swapped = !!value.from && !!value.to && value.from > value.to;
  return (
    <div className="menu-range">
      <label>From
        <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      </label>
      <label>To
        <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </label>
      {rangeActive(value) && <button type="button" className="btn small" onClick={() => onChange(NO_RANGE)}><CloseIcon /> Clear dates</button>}
      {swapped && <p className="error range-error" role="alert">The From date is after the To date.</p>}
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
