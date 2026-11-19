import { Fragment } from "react";
import { stampOf, type Entry } from "./entries";
import { longDay } from "./report";
import { formatHM, sumMinutes, weekNumber, weekRange, weekStart } from "./weeks";
import EntryCard from "./EntryCard";

type Props = {
  entries: Entry[];
  onEdit?: (entry: Entry) => void;
  inGroup?: { id: string; canModerate: boolean };
  /** Day headings only make sense when the list runs in date order. */
  dayHeadings?: boolean;
  /**
   * Also split the list by week (Sunday to Saturday), each week with its number and total hours, and show the hours
   * under each day. `origin` is the first day of the logbook: that week is Week 1. Only for your own entries.
   */
  weeks?: { origin: string };
  /** Show the hours under each day without the week headings (the Days view of your logbook). */
  dayHours?: boolean;
  /**
   * Every entry that counts as hours, including shifts saved by Clock out (hours only, not listed in the logbook).
   * Day and week totals are added up from these, so they match the Hours card whatever is listed or filtered.
   */
  hoursSource?: Entry[];
  /** Someone else's logbook: week and day headings without hours (their hours are shared only through Privacy settings). */
  hideHours?: boolean;
};

/** Entries in the order given, under week and day headings when they run by date. */
export default function EntryList({ entries, onEdit, inGroup, dayHeadings = true, weeks, dayHours, hoursSource, hideHours }: Props) {
  let lastDay = "";
  let lastWeek = "";
  const minutesByDay = new Map<string, number>();
  const minutesByWeek = new Map<string, number>();
  if ((weeks || dayHours) && dayHeadings && !hideHours) {
    for (const e of hoursSource ?? entries.filter((x) => !x.repostedBy)) {
      const m = sumMinutes([e]);
      if (m <= 0) continue;
      minutesByDay.set(e.date, (minutesByDay.get(e.date) ?? 0) + m);
      const wk = weekStart(e.date);
      minutesByWeek.set(wk, (minutesByWeek.get(wk) ?? 0) + m);
    }
  }
  return (
    <div className={`entries${dayHeadings ? "" : " flat"}`}>
      {entries.map((e) => {
        const day = stampOf(e).slice(0, 10);
        const header = dayHeadings && day !== lastDay;
        lastDay = day;
        const wk = weekStart(day);
        const weekHeader = !!weeks && dayHeadings && wk !== lastWeek;
        lastWeek = wk;
        const dayMinutes = minutesByDay.get(day) ?? 0;
        return (
          <Fragment key={`${e.repostedBy ?? ""}-${e.ownerUid}-${e.id}`}>
            {weekHeader && weeks && (
              <div className="week-label" role="heading" aria-level={2}>
                <span>Week {weekNumber(wk, weeks.origin)}<small>{weekRange(wk)}</small></span>
                {!hideHours && <b>{formatHM(minutesByWeek.get(wk) ?? 0)}</b>}
              </div>
            )}
            {header && (
              <div className="day-label">
                {longDay(day)}
                {(weeks || dayHours) && dayMinutes > 0 && <small className="day-hours">{formatHM(dayMinutes)}</small>}
              </div>
            )}
            <EntryCard entry={e} onEdit={onEdit} inGroup={inGroup} />
          </Fragment>
        );
      })}
    </div>
  );
}
