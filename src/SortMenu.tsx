import { useEffect, useState } from "react";
import { isDefaultSort, PERIODS, SORT_KINDS, type SortMode } from "./sorting";
import { CheckIcon, SortIcon } from "./icons";

type Props = {
  mode: SortMode;
  onChange: (mode: SortMode) => void;
};

/** Sort button with the sort choices (Newest, Hottest, Popular with a period, Oldest). The date filter is its own button (DateFilterMenu); Days / Weeks / Months is the logbook's own toggle. */
export default function SortMenu({ mode, onChange }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const label = SORT_KINDS.find((k) => k.id === mode.kind)?.label ?? "";
  const item = (on: boolean, label: string, pick: () => void, hint?: string) => (
    <button key={label} type="button" role="menuitemradio" aria-checked={on} className={on ? "on" : ""} title={hint} onClick={pick}>
      {on ? <CheckIcon /> : <span className="menu-gap" />}{label}
    </button>
  );

  return (
    <div className="post-menu">
      <button type="button" className={`icon-btn menu-btn sort-btn${isDefaultSort(mode) ? "" : " sort-active"}`} aria-haspopup="menu" aria-expanded={open}
        aria-label={isDefaultSort(mode) ? "Sort entries" : `Sort entries. Sorted by ${label}`} title={isDefaultSort(mode) ? "Sort entries" : `Sorted by ${label}`}
        onClick={() => setOpen(!open)}><SortIcon /></button>
      {open && (
        <>
          <button type="button" className="menu-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="menu" role="menu" aria-label="Sort entries by">
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
          </div>
        </>
      )}
      {!isDefaultSort(mode) && <span className="sort-tag" role="status">{label}</span>}
    </div>
  );
}
