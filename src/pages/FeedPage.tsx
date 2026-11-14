import { useMemo } from "react";
import { useSession } from "../session";
import { useSharedEntries, type Source } from "../feed";
import { newestFirst } from "../entries";
import { useRepostedEntries } from "../reposts";
import EntryList from "../EntryList";

export default function FeedPage() {
  const s = useSession();
  const sources = useMemo<Source[]>(() => {
    const ids = new Set([...s.friends, ...s.following]);
    return [...ids].map((uid) => ({ uid, friend: s.friends.has(uid) }));
  }, [s.friends, s.following]);
  const { entries: original, loading, error } = useSharedEntries(sources);
  const people = useMemo(() => sources.map((x) => x.uid), [sources]);
  const reposts = useRepostedEntries(people, 8);
  // A friend's repost of your own entry is not news to you.
  const entries = useMemo(
    () => [...original, ...reposts.filter((r) => r.ownerUid !== s.uid)].sort(newestFirst).slice(0, 80),
    [original, reposts, s.uid],
  );

  return (
    <div className="feed">
      <h1 className="page-title">Feed</h1>
      {error && <p className="error note" role="alert">{error}</p>}
      {sources.length === 0 && (
        <div className="empty">
          <h2>Nothing here yet</h2>
          <p>Add friends or follow people to see the entries they share with you.</p>
          <a className="btn primary" href="#/people">Find people</a>
        </div>
      )}
      {sources.length > 0 && loading && entries.length === 0 && <p className="note">Loading the feed…</p>}
      {sources.length > 0 && !loading && entries.length === 0 && !error && (
        <div className="empty">
          <h2>No shared entries yet</h2>
          <p>When your friends or the people you follow share an entry, it shows up here.</p>
        </div>
      )}
      <EntryList entries={entries} />
    </div>
  );
}
