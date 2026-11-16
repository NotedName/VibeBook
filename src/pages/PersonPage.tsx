import { useEffect, useMemo, useRef, useState } from "react";
import { useSlideOnChange } from "../slide";
import { useProfile, useSession } from "../session";
import { usePresence } from "../activeStatus";
import ProfileTabs, { type ProfileTab } from "../ProfileTabs";
import { useSharedEntries } from "../feed";
import { newestFirst } from "../entries";
import { dateDir, useSortedEntries, useSortMode } from "../sorting";
import SortMenu from "../SortMenu";
import SharedHoursCard from "../SharedHoursCard";
import SharedStatusCard from "../SharedStatusCard";
import SharedScheduleCard from "../SharedScheduleCard";
import { useCanSee } from "../audience";
import { useRepostedEntries } from "../reposts";
import { useTeasedEntries } from "../teasers";
import ProfileHeader from "../ProfileHeader";
import RelationButtons from "../RelationButtons";
import FriendsSheet from "../FriendsSheet";
import { LockIcon, UsersIcon } from "../icons";
import EntryList from "../EntryList";
import { FeedSkeleton, ProfileSkeleton } from "../Skeleton";
import { resolveUserRef } from "../profiles";
import { useMutualFriends } from "../friendList";

export default function PersonPage({ uid }: { uid: string }) {
  const s = useSession();
  const p = useProfile(uid);
  const friend = s.friends.has(uid);
  // A private profile shows its entries, hours, schedule and friends only to friends. Your own profile seen "as someone
  // else" counts as a stranger's. Nothing is queried for it, since firestore.rules would refuse.
  const hidden = p?.privateProfile === true && !friend;
  const presence = usePresence(hidden ? undefined : uid);
  const sources = useMemo(() => (p === undefined || hidden ? [] : [{ uid, friend }]), [uid, friend, p, hidden]);
  const [mode, setMode] = useSortMode("person");
  const dir = dateDir(mode);
  const { entries: original, loading, error } = useSharedEntries(sources, 100, dir);
  const who = useMemo(() => (p === undefined || hidden ? [] : [uid]), [uid, p, hidden]);
  // Posts in private groups: the real entry for people in the group, a "join the group to see this" placeholder for
  // everyone else. Your own profile seen "as someone else" shows placeholders too.
  const none = useMemo(() => new Set<string>(), []);
  const privatePosts = useTeasedEntries(who, uid === s.uid ? none : s.groups.ids, 30, dir);
  const reposts = useRepostedEntries(who, 15, dir, 0, "stub");
  const [tab, setTab] = useState<ProfileTab>("notes");
  const feedRef = useRef<HTMLDivElement>(null);
  useSlideOnChange(feedRef, (["notes", "reposts", "likes"] as const).indexOf(tab));
  const pool = useMemo(
    () => [...(tab === "reposts" ? reposts : [...original, ...privatePosts])].sort(dir === "asc" ? (a, b) => -newestFirst(a, b) : newestFirst),
    [tab, original, privatePosts, reposts, dir],
  );
  const entries = useSortedEntries(pool, mode);
  const rel = s.relationOf(uid);
  const [friendsOpen, setFriendsOpen] = useState<"all" | "mutual" | null>(null);
  const canSeeFriends = useCanSee(uid, p ? p.friendsAudience : "private");
  const { mutual } = useMutualFriends(uid, s.friends, uid !== s.uid && canSeeFriends === true && !hidden);

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
      <ProfileHeader profile={hidden ? { ...p, headline: "", workplace: "", bio: "" } : p}>
        {!hidden && presence.label && (
          <p className={`profile-presence${presence.status === "active" ? " online" : ""}`}>
            {presence.status === "active" && <i className="presence-dot" aria-hidden="true" />}
            {presence.label}
          </p>
        )}
        <div className="profile-actions">
          <RelationButtons uid={uid} />
          {!hidden && (
            <button type="button" className="btn" onClick={() => setFriendsOpen("all")}
              title={canSeeFriends === false && uid !== s.uid ? "Friends list is private" : undefined}>
              {canSeeFriends === false && uid !== s.uid ? <LockIcon /> : <UsersIcon />} Friends
            </button>
          )}
        </div>
        {mutual && mutual.length > 0 && (
          <button type="button" className="mutual-link" onClick={() => setFriendsOpen("mutual")}>
            <UsersIcon />{mutual.length} mutual friend{mutual.length === 1 ? "" : "s"}
          </button>
        )}
        {!hidden && <SharedStatusCard uid={uid} audience={p.statusAudience} />}
        {!hidden && <SharedHoursCard uid={uid} audience={p.hoursAudience} />}
        {!hidden && <SharedScheduleCard uid={uid} audience={p.scheduleAudience} />}
        {rel === "incoming" && <p className="hint pad-b">{p.displayName} sent you a friend request.</p>}
      </ProfileHeader>
      {hidden && (
        <div className="empty">
          <h2><LockIcon /> This profile is private</h2>
          <p>{uid === s.uid ? "This is what people who are not your friends see." : `Become friends with ${p.displayName} to see their entries, hours and schedule.`}</p>
        </div>
      )}
      {!hidden && <ProfileTabs tab={tab} onChange={setTab}>
        {entries.length > 1 && <SortMenu mode={mode} onChange={setMode} />}
      </ProfileTabs>}
      {friendsOpen && <FriendsSheet uid={uid} initialView={friendsOpen} onClose={() => setFriendsOpen(null)} />}
      {!hidden && <div className="feed" ref={feedRef}>
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
      </div>}
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
