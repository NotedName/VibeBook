import type { Entry } from "./entries";
import { longDay } from "./report";
import EntryCard from "./EntryCard";

type Props = { entries: Entry[]; onEdit?: (entry: Entry) => void };

/** Entries grouped under day headings, newest first. */
export default function EntryList({ entries, onEdit }: Props) {
  let last = "";
  return (
    <>
      {entries.map((e) => {
        const header = e.date !== last;
        last = e.date;
        return (
          <div key={`${e.ownerUid}-${e.id}`}>
            {header && <div className="day-label">{longDay(e.date)}</div>}
            <EntryCard entry={e} onEdit={onEdit} />
          </div>
        );
      })}
    </>
  );
}
