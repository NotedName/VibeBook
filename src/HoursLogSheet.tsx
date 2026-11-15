import { useEffect, useMemo } from "react";
import type { Entry } from "./entries";
import { runningMinutes, type RunningClock } from "./hours";
import type { BreakPlan } from "./availability";
import { clockTime, longDay, todayStr } from "./report";
import { entryMinutes, formatHM, sumMinutes, weekEnd, weekNumber, weekRange, weekStart, earliestDay } from "./weeks";
import { useSession } from "./session";
import { ClockIcon, CloseIcon, EditIcon } from "./icons";
import { useScrollLock } from "./scrollLock";

/** Your own hours, newest first, week by week: when each shift started and ended, how long it was, and whether the start was edited. */
export default function HoursLogSheet({ entries, clock, plan, onClose }: { entries: Entry[]; clock: RunningClock | null; plan?: BreakPlan | null; onClose: () => void }) {
  useScrollLock();
  const s = useSession();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const logged = useMemo(
    () => entries.filter((e) => e.clockIn && e.clockOut).sort((a, b) => (a.date === b.date ? (b.clockIn! > a.clockIn! ? 1 : -1) : a.date < b.date ? 1 : -1)),
    [entries],
  );
  const origin = earliestDay(logged);
  const weeks = useMemo(() => {
    const m = new Map<string, Entry[]>();
    logged.forEach((e) => m.set(weekStart(e.date), [...(m.get(weekStart(e.date)) ?? []), e]));
    return [...m];
  }, [logged]);
  const edits = logged.filter((e) => e.startEdited).length;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Logged hours">
        <div className="sheet-head">
          <h2>Logged hours</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <p className="hint">
            {logged.length === 0 ? "Nothing logged yet." : <><b>{formatHM(sumMinutes(logged))}</b> over {logged.length} {logged.length === 1 ? "shift" : "shifts"}{edits > 0 ? ` · ${edits} with an edited start` : ""}.</>}
          </p>

          {clock && (
            <section className="log-week">
              <ul className="log-list">
                <li className="log-row running">
                  <div className="log-main">
                    <b>{longDay(clock.date)}{clock.date === todayStr() ? " (today)" : ""}</b>
                    <span className="log-times"><ClockIcon /> {clockTime(clock.time)} – still running</span>
                    {clock.edited && <span className="log-badge">Start edited · was {clockTime(clock.origTime!)}{clock.origDate !== clock.date ? `, ${longDay(clock.origDate!)}` : ""}</span>}
                  </div>
                  <span className="log-len">{formatHM(runningMinutes(clock, Date.now(), plan))}</span>
                </li>
              </ul>
            </section>
          )}

          {weeks.map(([wk, list]) => (
            <section key={wk} className="log-week" aria-label={`Week ${weekNumber(wk, origin || wk)}`}>
              <h3>Week {weekNumber(wk, origin || wk)} <small>{weekRange(wk)} · {formatHM(sumMinutes(list))}</small></h3>
              <ul className="log-list">
                {list.map((e) => (
                  <li key={e.id} className="log-row">
                    <div className="log-main">
                      <b>{longDay(e.date)}</b>
                      <span className="log-times"><ClockIcon /> {clockTime(e.clockIn!)} – {clockTime(e.clockOut!)}{e.clockOut! < e.clockIn! ? " (next day)" : ""}</span>
                      {e.startEdited && e.originalStart && (
                        <span className="log-badge">Start edited · was {clockTime(e.originalStart)}{e.originalStartDate && e.originalStartDate !== e.date ? `, ${longDay(e.originalStartDate)}` : ""}</span>
                      )}
                    </div>
                    <span className="log-len">{formatHM(entryMinutes(e))}</span>
                    <button type="button" className="icon-btn log-edit" aria-label={`Open the ${longDay(e.date)} entry`} onClick={() => s.openEntry(e)}><EditIcon /></button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
