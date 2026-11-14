import { useEffect, useMemo, useState } from "react";
import { useProfile, useSession } from "../session";
import ProfileTabs, { type ProfileTab } from "../ProfileTabs";
import { useSharedEntries } from "../feed";
import { newestFirst } from "../entries";
import { dateDir, useSortedEntries, useSortMode } from "../sorting";
import SortBar from "../SortBar";
import { useRepostedEntries } from "../reposts";
import ProfileHeader from "../ProfileHeader";
import RelationButtons from "../RelationButtons";
import EntryList from "../EntryList";
import { FeedSkeleton, ProfileSkeleton } from "../Skeleton";
import { resolveUserRef } from "../profiles";

export default function PersonPage({ uid }: { uid: string }) {
  const s = useSession();
  const p = useProfile(uid);
  const friend = s.friends.has(uid);
  const sources = useMemo(() => [{ uid, friend }], [uid, friend]);
  const [mode, setMode] = useSortMode("person");
  const dir = dateDir(mode);
  const { entries: original, loading, error } = useSharedEntries(sources, 100, dir);
  const who = useMemo(() => [uid], [uid]);
  const reposts = useRepostedEntries(who, 15, dir);
  const [tab, setTab] = useState<ProfileTab>("notes");
  const pool = useMemo(
    () => [...(tab === "reposts" ? reposts : original)].sort(dir === "asc" ? (a, b) => -newestFirst(a, b) : newestFirst),
    [tab, original, reposts, dir],
  );
  const entries = useSortedEntries(pool, mode);
  const rel = s.relationOf(uid);

  if (p === undefined) return <><ProfileSkeleton /><FeedSkeleton /></>;
  if (p === null) {
    return (
      <div className="empty">
        <h2>Profile not found</h2>
        <p>This person may not have set up VibeBook yet.</p>
        <a className="btn" href="#/people">Back to people</a>
      </div>
    );
  }
  return (
    <>
      <ProfileHeader profile={p}>
        <div className="profile-actions"><RelationButtons uid={uid} /></div>
        {rel === "incoming" && <p className="hint pad-b">{p.displayName} sent you a friend request.</p>}
      </ProfileHeader>
      <ProfileTabs tab={tab} onChange={setTab} />
      <div className="feed">
        {entries.length > 1 && <SortBar mode={mode} onChange={setMode} />}
        {error && <p className="error note" role="alert">{error}</p>}
        {loading && entries.length === 0 && <FeedSkeleton />}
        {tab === "reposts" && entries.length === 0 && (
          <div className="empty">
            <h2>No reposts</h2>
            <p>{p.displayName} has not reposted anything you can see.</p>
          </div>
        )}
        {tab === "notes" && !loading && entries.length === 0 && !error && (
          <div className="empty">
            <h2>Nothing shared yet</h2>
            <p>{friend ? `${p.displayName} has not shared any entries with friends yet.` : `${p.displayName} has no public entries. Entries shared with friends show up once you are friends.`}</p>
          </div>
        )}
        <EntryList entries={entries} dayHeadings={mode.kind === "newest" || mode.kind === "oldest"} />
      </div>
    </>
  );
}

/** What #/u/<handle> opens: the handle is a username (or a uid, from links made before usernames), turned into a uid first. */
export function PersonRoute({ handle }: { handle: string }) {
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setUid(undefined);
    resolveUserRef(handle).then((u) => live && setUid(u), () => live && setUid(null));
    return () => { live = false; };
  }, [handle]);
  if (uid === undefined) return <><ProfileSkeleton /><FeedSkeleton /></>;
  if (uid === null) {
    return (
      <div className="empty">
        <h2>Profile not found</h2>
        <p>No one has the username @{handle.replace(/^@/, "")}. They may have changed it.</p>
        <a className="btn" href="#/people">Back to people</a>
      </div>
    );
  }
  return <PersonPage key={uid} uid={uid} />;
}
