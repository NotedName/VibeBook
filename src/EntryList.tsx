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
};

/** Entries in the order given, under week and day headings when they run by date. */
export default function EntryList({ entries, onEdit, inGroup, dayHeadings = true, weeks, dayHours }: Props) {
  let lastDay = "";
  let lastWeek = "";
  const byWeek = new Map<string, Entry[]>();
  const byDay = new Map<string, Entry[]>();
  if ((weeks || dayHours) && dayHeadings) {
    entries.forEach((e) => {
      const day = stampOf(e).slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), e]);
      const wk = weekStart(day);
      byWeek.set(wk, [...(byWeek.get(wk) ?? []), e]);
    });
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
        const dayMinutes = sumMinutes(byDay.get(day) ?? []);
        return (
          <Fragment key={`${e.repostedBy ?? ""}-${e.ownerUid}-${e.id}`}>
            {weekHeader && weeks && (
              <div className="week-label" role="heading" aria-level={2}>
                <span>Week {weekNumber(wk, weeks.origin)}<small>{weekRange(wk)}</small></span>
                <b>{formatHM(sumMinutes(byWeek.get(wk) ?? []))}</b>
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
