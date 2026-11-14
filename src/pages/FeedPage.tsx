import { useMemo } from "react";
import { useSession } from "../session";
import { useSharedEntries, type Source } from "../feed";
import { newestFirst } from "../entries";
import { dateDir, useSortedEntries, useSortMode } from "../sorting";
import SortBar from "../SortBar";
import { useRepostedEntries } from "../reposts";
import EntryList from "../EntryList";
import { FeedSkeleton } from "../Skeleton";

export default function FeedPage() {
  const s = useSession();
  const sources = useMemo<Source[]>(() => {
    const ids = new Set([...s.friends, ...s.following]);
    return [...ids].map((uid) => ({ uid, friend: s.friends.has(uid) }));
  }, [s.friends, s.following]);
  const [mode, setMode] = useSortMode("feed");
  const dir = dateDir(mode);
  const { entries: original, loading, error } = useSharedEntries(sources, 60, dir);
  const people = useMemo(() => sources.map((x) => x.uid), [sources]);
  const reposts = useRepostedEntries(people, 8, dir);
  // A friend's repost of your own entry is not news to you.
  // The pool is the newest (or, for Oldest, the oldest) entries; the chosen sort then orders what was loaded.
  const pool = useMemo(
    () => [...original, ...reposts.filter((r) => r.ownerUid !== s.uid)]
      .sort(dir === "asc" ? (a, b) => -newestFirst(a, b) : newestFirst).slice(0, 80),
    [original, reposts, s.uid, dir],
  );
  const entries = useSortedEntries(pool, mode);

  return (
    <div className="feed">
      <h1 className="page-title">Feed</h1>
      {sources.length > 0 && <SortBar mode={mode} onChange={setMode} />}
      {error && <p className="error note" role="alert">{error}</p>}
      {sources.length === 0 && (
        <div className="empty">
          <h2>Nothing here yet</h2>
          <p>Add friends or follow people to see the entries they share with you.</p>
          <a className="btn primary" href="#/people">Find people</a>
        </div>
      )}
      {sources.length > 0 && loading && entries.length === 0 && <FeedSkeleton />}
      {sources.length > 0 && !loading && entries.length === 0 && !error && (
        <div className="empty">
          <h2>No shared entries yet</h2>
          <p>When your friends or the people you follow share an entry, it shows up here.</p>
        </div>
      )}
      <EntryList entries={entries} dayHeadings={mode.kind === "newest" || mode.kind === "oldest"} />
    </div>
  );
}
