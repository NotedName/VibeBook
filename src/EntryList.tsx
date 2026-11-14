import { Fragment } from "react";
import { stampOf, type Entry } from "./entries";
import { longDay } from "./report";
import EntryCard from "./EntryCard";

type Props = {
  entries: Entry[];
  onEdit?: (entry: Entry) => void;
  inGroup?: { id: string; canModerate: boolean };
  /** Day headings only make sense when the list runs in date order. */
  dayHeadings?: boolean;
};

/** Entries in the order given, under day headings when they run by date. */
export default function EntryList({ entries, onEdit, inGroup, dayHeadings = true }: Props) {
  let last = "";
  return (
    <div className={`entries${dayHeadings ? "" : " flat"}`}>
      {entries.map((e) => {
        const day = stampOf(e).slice(0, 10);
        const header = dayHeadings && day !== last;
        last = day;
        return (
          <Fragment key={`${e.repostedBy ?? ""}-${e.ownerUid}-${e.id}`}>
            {header && <div className="day-label">{longDay(day)}</div>}
            <EntryCard entry={e} onEdit={onEdit} inGroup={inGroup} />
          </Fragment>
        );
      })}
    </div>
  );
}
