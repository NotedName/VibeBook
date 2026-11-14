import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { Entry } from "../entries";
import { useSession } from "../session";
import EntryCard from "../EntryCard";

/** One entry opened from a share link, with full interaction for signed-in people. */
export default function PostPage({ uid, id }: { uid: string; id: string }) {
  const s = useSession();
  // undefined = loading, null = not there or not allowed
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);

  useEffect(() => {
    setEntry(undefined);
    return onSnapshot(
      doc(db, "users", uid, "entries", id),
      (snap) => setEntry(snap.exists() ? ({ id: snap.id, ownerUid: uid, ...snap.data() } as Entry) : null),
      () => setEntry(null),
    );
  }, [uid, id]);

  return (
    <div className="feed">
      {entry === undefined && <p className="note">Loading…</p>}
      {entry === null && (
        <div className="empty">
          <h2>This entry is not available</h2>
          <p>It may have been deleted, or it is not shared with you.</p>
        </div>
      )}
      {entry && <EntryCard entry={entry} onEdit={uid === s.uid ? (e) => s.openEntry(e) : undefined} />}
    </div>
  );
}
