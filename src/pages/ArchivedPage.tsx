import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { entriesRef, newestFirst, type Entry } from "../entries";
import { useSession } from "../session";
import EntryList from "../EntryList";
import { FeedSkeleton } from "../Skeleton";
import { ArchiveIcon } from "../icons";

/** Opened from Settings > Data & account > Archived entries: the entries you tucked away. Only you can see them; Unarchive puts one back. */
export default function ArchivedPage() {
  const s = useSession();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(
    () => onSnapshot(
      query(entriesRef(s.uid), orderBy("date", "desc")),
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ownerUid: s.uid, ...d.data() }) as Entry));
        setError("");
      },
      () => { setEntries([]); setError("Could not load your archived entries. Check your connection."); },
    ),
    [s.uid],
  );

  const archived = useMemo(() => (entries ?? []).filter((e) => e.archived === true).sort(newestFirst), [entries]);

  return (
    <div className="feed">
      <div className="title-row">
        <h1 className="page-title">Archived entries</h1>
      </div>
      <p className="hint archived-note"><ArchiveIcon />Only you can see these. Hidden from your logbook, feed, groups, share links, stats and reports until you unarchive.</p>
      {error && <p className="error note" role="alert">{error}</p>}
      {entries === null && <FeedSkeleton />}
      {entries !== null && archived.length === 0 && !error && (
        <div className="empty">
          <h2>Nothing archived</h2>
          <p>Open the ⋯ menu on one of your entries and choose Archive to tuck it away here without deleting it.</p>
          <a className="btn primary" href="#/me">Back to my logbook</a>
        </div>
      )}
      <EntryList entries={archived} onEdit={s.openEntry} />
    </div>
  );
}
