import { useCallback, useMemo, useState } from "react";
import { useSession } from "../session";
import { useLockedProfiles, useSharedEntries, type Source } from "../feed";
import { useForYou } from "../discover";
import { newestFirst } from "../entries";
import { useRepostedEntries } from "../reposts";
import { PullIndicator, usePullToRefresh } from "../PullToRefresh";
import EntryList from "../EntryList";
import { FeedSkeleton } from "../Skeleton";
import { FeedIcon, GlobeIcon } from "../icons";

type Tab = "following" | "foryou";

/**
 * Following: everything friends and followed people shared, newest first.
 * For you: other people's public entries and those of the people you follow, ranked together by how well their skills match your own.
 * (Sorting lives on group pages and logbooks.)
 */
export default function FeedPage() {
  const s = useSession();
  const [tab, setTab] = useState<Tab>("following");
  // Followed people with a private profile share nothing with non-friends, so they are not queried.
  const followed = useMemo(() => [...s.following].filter((uid) => !s.friends.has(uid)), [s.following, s.friends]);
  const locked = useLockedProfiles(followed);
  const sources = useMemo<Source[]>(() => {
    const open = followed.filter((uid) => locked !== null && !locked.has(uid));
    const friends = [...s.friends].filter((uid) => !s.unfollowed.has(uid)); // unfollowed friends stay friends, but not in this feed
    return [...new Set([...friends, ...open])].map((uid) => ({ uid, friend: s.friends.has(uid) }));
  }, [s.friends, s.unfollowed, followed, locked]);
  // Pulling the page down bumps this, which makes the lists below read their data again (the site itself is not reloaded).
  const [round, setRound] = useState(0);
  const refresh = useCallback(() => setRound((r) => r + 1), []);
  const { entries: original, loading, error } = useSharedEntries(sources, 60, "desc", round);
  const people = useMemo(() => sources.map((x) => x.uid), [sources]);
  const reposts = useRepostedEntries(people, 8, "desc", round);
  // A friend's repost of your own entry is not news to you.
  const entries = useMemo(
    () => [...original, ...reposts.filter((r) => r.ownerUid !== s.uid)].sort(newestFirst).slice(0, 80),
    [original, reposts, s.uid],
  );

  const followedPeople = useMemo(() => new Set(people), [people]);
  const forYou = useForYou(s.uid, original, followedPeople, tab === "foryou", round);
  const pulling = usePullToRefresh(refresh, tab === "following" ? loading : forYou.loading);

  return (
    <div className="feed">
      <PullIndicator {...pulling} />
      <div className="title-row">
        <h1 className="page-title">Feed</h1>
      </div>
      <div className="profile-bar">
        <div className="profile-tabs">
          <div className="profile-tablist" role="tablist" aria-label="Feed sections">
            <button type="button" role="tab" aria-selected={tab === "following"} onClick={() => setTab("following")}><FeedIcon /><span>Following</span></button>
            <button type="button" role="tab" aria-selected={tab === "foryou"} onClick={() => setTab("foryou")}><GlobeIcon /><span>For you</span></button>
          </div>
        </div>
      </div>

      {tab === "following" && (
        <>
          {error && <p className="error note" role="alert">{error}</p>}
          {sources.length === 0 && (
            <div className="empty">
              <h2>Nothing here yet</h2>
              <p>Add friends or follow people to see the entries they share with you.</p>
              <a className="btn primary" href="#/people">Find people</a>
              <button type="button" className="btn" onClick={() => setTab("foryou")}>See entries for you</button>
            </div>
          )}
          {sources.length > 0 && loading && entries.length === 0 && <FeedSkeleton />}
          {sources.length > 0 && !loading && entries.length === 0 && !error && (
            <div className="empty">
              <h2>No shared entries yet</h2>
              <p>When your friends or the people you follow share an entry, it shows up here.</p>
            </div>
          )}
          <EntryList entries={entries} dayHeadings />
        </>
      )}

      {tab === "foryou" && (
        <>
          {forYou.error && <p className="error note" role="alert">{forYou.error}</p>}
          {forYou.loading && forYou.entries.length === 0 && <FeedSkeleton />}
          {!forYou.loading && forYou.entries.length === 0 && !forYou.error && (
            <div className="empty">
              <h2>Nothing to suggest yet</h2>
              <p>Public entries from people you do not know yet show up here, mixed with those of the people you follow and ordered by the skills you share with them.</p>
            </div>
          )}
          <EntryList entries={forYou.entries} dayHeadings={false} />
        </>
      )}
    </div>
  );
}
