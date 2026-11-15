import { useEffect, useState } from "react";
import { PERIODS, SORT_KINDS, type Grouping, type SortMode } from "./sorting";
import { CheckIcon, MenuIcon } from "./icons";
import { DateRangeFields, rangeActive, type DateRange } from "./DateRangeFilter";

type Props = {
  mode: SortMode;
  onChange: (mode: SortMode) => void;
  /** Only on your own logbook: also offer to group the list by week or by day, in this same menu. */
  grouping?: Grouping;
  onGrouping?: (g: Grouping) => void;
  /** Only on your own logbook: also offer to show only the days between two dates, in this same menu. */
  range?: DateRange;
  onRange?: (r: DateRange) => void;
};

/** Hamburger button with the sort choices (Newest, Hottest, Popular with a period, Oldest) and, on your logbook, the Weeks / Days view and the date filter. */
export default function SortMenu({ mode, onChange, grouping, onGrouping, range, onRange }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const item = (on: boolean, label: string, pick: () => void, hint?: string) => (
    <button key={label} type="button" role="menuitemradio" aria-checked={on} className={on ? "on" : ""} title={hint} onClick={pick}>
      {on ? <CheckIcon /> : <span className="menu-gap" />}{label}
    </button>
  );

  return (
    <div className="post-menu">
      <button type="button" className={`icon-btn menu-btn sort-btn${range && rangeActive(range) ? " filtered" : ""}`}
        aria-label={range ? (rangeActive(range) ? "Sort and filter entries (dates filtered)" : "Sort and filter entries") : "Sort entries"} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(!open)}><MenuIcon /></button>
      {open && (
        <>
          <button type="button" className="menu-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className={`menu${range ? " menu-wide" : ""}`} role="menu" aria-label={range ? "Sort and filter entries" : "Sort entries by"}>
            <span className="menu-title">Sort by</span>
            {SORT_KINDS.map((k) => item(mode.kind === k.id, k.label, () => {
              onChange({ ...mode, kind: k.id });
              if (k.id !== "popular") setOpen(false);
            }, k.hint))}
            {mode.kind === "popular" && (
              <>
                <span className="menu-title">Popular during</span>
                {PERIODS.map((p) => item(mode.period === p.id, p.label, () => { onChange({ ...mode, period: p.id }); setOpen(false); }))}
              </>
            )}
            {grouping && onGrouping && (mode.kind === "newest" || mode.kind === "oldest") && (
              <>
                <span className="menu-title">View</span>
                {item(grouping === "weeks", "Weeks", () => { onGrouping("weeks"); setOpen(false); }, "Group by week, with the hours for each week")}
                {item(grouping === "days", "Days", () => { onGrouping("days"); setOpen(false); }, "Group by day only")}
              </>
            )}
            {range && onRange && (
              <>
                <span className="menu-title">Filter by date</span>
                <DateRangeFields value={range} onChange={onRange} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
