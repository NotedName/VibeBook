import { Fragment } from "react";
import { stampOf, type Entry } from "./entries";
import { longDay } from "./report";
import EntryCard from "./EntryCard";

type Props = { entries: Entry[]; onEdit?: (entry: Entry) => void };

/** Entries grouped under day headings, newest first. */
export default function EntryList({ entries, onEdit }: Props) {
  let last = "";
  return (
    <div className="entries">
      {entries.map((e) => {
        const day = stampOf(e).slice(0, 10);
        const header = day !== last;
        last = day;
        return (
          <Fragment key={`${e.repostedBy ?? ""}-${e.ownerUid}-${e.id}`}>
            {header && <div className="day-label">{longDay(day)}</div>}
            <EntryCard entry={e} onEdit={onEdit} />
          </Fragment>
        );
      })}
    </div>
  );
}
