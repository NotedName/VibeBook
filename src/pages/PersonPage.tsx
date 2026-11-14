import { useMemo } from "react";
import { useProfile, useSession } from "../session";
import { useSharedEntries } from "../feed";
import { newestFirst } from "../entries";
import { useRepostedEntries } from "../reposts";
import ProfileHeader from "../ProfileHeader";
import RelationButtons from "../RelationButtons";
import EntryList from "../EntryList";

export default function PersonPage({ uid }: { uid: string }) {
  const s = useSession();
  const p = useProfile(uid);
  const friend = s.friends.has(uid);
  const sources = useMemo(() => [{ uid, friend }], [uid, friend]);
  const { entries: original, loading, error } = useSharedEntries(sources, 100);
  const who = useMemo(() => [uid], [uid]);
  const reposts = useRepostedEntries(who);
  const entries = useMemo(() => [...original, ...reposts].sort(newestFirst), [original, reposts]);
  const rel = s.relationOf(uid);

  if (p === undefined) return <p className="note">Loading profile…</p>;
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
      <div className="feed">
        <h2 className="page-title sub">Shared entries</h2>
        {error && <p className="error note" role="alert">{error}</p>}
        {loading && <p className="note">Loading…</p>}
        {!loading && entries.length === 0 && !error && (
          <div className="empty">
            <h2>Nothing shared yet</h2>
            <p>{friend ? `${p.displayName} has not shared any entries with friends yet.` : `${p.displayName} has no public entries. Entries shared with friends show up once you are friends.`}</p>
          </div>
        )}
        <EntryList entries={entries} />
      </div>
    </>
  );
}
