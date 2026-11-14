import { PERIODS, SORT_KINDS, type SortMode } from "./sorting";

type Props = { mode: SortMode; onChange: (mode: SortMode) => void };

/** Sort picker for a list of entries: Newest, Hottest, Popular (with a period) and Oldest. */
export default function SortBar({ mode, onChange }: Props) {
  return (
    <div className="sortbar">
      <div className="sort-row" role="group" aria-label="Sort entries by">
        <span className="sort-label">Sort</span>
        {SORT_KINDS.map((k) => (
          <button key={k.id} type="button" className={`sort-chip${mode.kind === k.id ? " on" : ""}`}
            aria-pressed={mode.kind === k.id} title={k.hint} onClick={() => onChange({ ...mode, kind: k.id })}>
            {k.label}
          </button>
        ))}
      </div>
      {mode.kind === "popular" && (
        <div className="sort-row sub" role="group" aria-label="Popular during">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className={`sort-chip${mode.period === p.id ? " on" : ""}`}
              aria-pressed={mode.period === p.id} onClick={() => onChange({ ...mode, period: p.id })}>
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
