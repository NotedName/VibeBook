import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { entriesRef, newestFirst, stampOf, type Entry } from "../entries";
import { useRepostedEntries } from "../reposts";
import { earliestDay } from "../weeks";
import HoursCard from "../HoursCard";
import ReportSheet from "../ReportSheet";
import { inRange, NO_RANGE, rangeActive, RangeSummary } from "../DateRangeFilter";
import { useSession } from "../session";
import { dateDir, useGrouping, useSortedEntries, useSortMode } from "../sorting";
import { useLikedEntries } from "../likes";
import ProfileTabs, { type ProfileTab } from "../ProfileTabs";
import SortMenu from "../SortMenu";
import ProfileHeader from "../ProfileHeader";
import Avatar from "../Avatar";
import EntryList from "../EntryList";
import { FeedSkeleton } from "../Skeleton";
import PersonPage from "./PersonPage";
import { DownloadIcon, EyeIcon } from "../icons";
import FriendsSheet from "../FriendsSheet";

function Logbook({ onViewAs }: { onViewAs: () => void }) {
  const s = useSession();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [range, setRange] = useState(NO_RANGE);

  useEffect(
    () => onSnapshot(
      query(entriesRef(s.uid), orderBy("date", "desc")),
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ownerUid: s.uid, ...d.data() }) as Entry));
        setLoadError("");
      },
      () => { setEntries([]); setLoadError("Could not load your entries. Check your connection."); },
    ),
    [s.uid],
  );

  // Everything that counts as hours (HoursCard, reports) vs. what you posted: a shift saved by Clock out is hours only, not a logbook entry.
  const hoursList = useMemo(() => (entries ?? []).filter((e) => e.archived !== true).sort(newestFirst), [entries]);
  const list = useMemo(() => hoursList.filter((e) => e.hoursOnly !== true), [hoursList]);
  // Notes are what you wrote; Reposts and Likes are other people's entries. Only Notes count towards your stats and reports.
  const [tab, setTab] = useState<ProfileTab>("notes");
  const [mode, setMode] = useSortMode("logbook");
  const [grouping, setGrouping] = useGrouping("logbook");
  const myUid = useMemo(() => [s.uid], [s.uid]);
  const reposts = useRepostedEntries(myUid, 50, dateDir(mode));
  const likes = useLikedEntries(s.uid, tab === "likes");
  const pool = tab === "notes" ? list : tab === "reposts" ? reposts : likes.entries;
  // The date filter narrows whatever tab is open; totals, hours and reports above are not affected by it.
  const filtered = useMemo(() => (rangeActive(range) ? pool.filter((e) => inRange(stampOf(e).slice(0, 10), range)) : pool), [pool, range]);
  const shown = useSortedEntries(filtered, mode);
  const stats = useMemo(() => {
    const days = new Set(list.map((e) => e.date));
    const skills = new Set(list.flatMap((e) => e.skills.map((x) => x.toLowerCase())));
    return [["Entries", list.length], ["Days", days.size], ["Skills", skills.size], ["Friends", s.friends.size]] as const;
  }, [list, s.friends]);

  if (!s.me) return null;
  return (
    <>
      <ProfileHeader profile={s.me} editable onEditProfile={s.editProfile} onViewAs={onViewAs}>
        <div className="stats">
          {stats.map(([label, n]) => label === "Friends" ? (
            <button type="button" className="stat stat-btn" key={label} onClick={() => setFriendsOpen(true)}><b>{n}</b><span>{label}</span></button>
          ) : (
            <div className="stat" key={label}><b>{n}</b><span>{label}</span></div>
          ))}
        </div>

        <HoursCard entries={hoursList} loading={entries === null} />

        <div className="report">
          <button type="button" className="btn primary" onClick={() => setExportOpen(true)}><DownloadIcon /> Export Portfolio</button>
        </div>
      </ProfileHeader>

      {exportOpen && (
        <ReportSheet entries={hoursList} onClose={() => setExportOpen(false)}
          initialRange={range.from && range.to && range.from <= range.to ? range : undefined} />
      )}
      {friendsOpen && <FriendsSheet uid={s.uid} onClose={() => setFriendsOpen(false)} />}
      <ProfileTabs tab={tab} onChange={setTab} showLikes>
        {(pool.length > 1 || rangeActive(range)) && (
          <SortMenu mode={mode} onChange={setMode} grouping={tab === "notes" ? grouping : undefined} onGrouping={setGrouping} range={range} onRange={setRange} />
        )}
      </ProfileTabs>

      <RangeSummary value={range} onChange={setRange} shown={filtered.length} total={pool.length} />

      <div className="composer">
        <Avatar profile={s.me} />
        {tab === "notes" ? (
          <button type="button" className="composer-input" onClick={() => s.openEntry(null)}>
            What did you work on today?
          </button>
        ) : <span className="composer-input static">{tab === "reposts" ? "Entries you reposted" : "Entries you gave a Vibe"}</span>}
      </div>

      {loadError && <p className="error note" role="alert">{loadError}</p>}

      <div className="feed" aria-live="polite">
        {entries === null && <FeedSkeleton />}
        {tab === "notes" && entries !== null && pool.length === 0 && !loadError && (
          <div className="empty">
            <h2>Your logbook is empty</h2>
            <p>Add what you did today with a photo, the skills you picked up and a short description. Entries show up here, newest first.</p>
            <button type="button" className="btn primary" onClick={() => s.openEntry(null)}>Write the first entry</button>
          </div>
        )}
        {rangeActive(range) && pool.length > 0 && shown.length === 0 && (
          <div className="empty">
            <h2>Nothing in these dates</h2>
            <p>No entries fall between the dates you picked.</p>
            <button type="button" className="btn primary" onClick={() => setRange(NO_RANGE)}>Clear the dates</button>
          </div>
        )}
        {tab === "reposts" && pool.length === 0 && (
          <div className="empty">
            <h2>No reposts yet</h2>
            <p>Tap Repost on a public entry to add it here and show it to your friends.</p>
            <a className="btn primary" href="#/feed">Browse the feed</a>
          </div>
        )}
        {tab === "likes" && likes.loading && pool.length === 0 && <FeedSkeleton />}
        {tab === "likes" && !likes.loading && pool.length === 0 && (
          <div className="empty">
            <h2>Nothing liked yet</h2>
            <p>Entries you give a Vibe show up here, only for you. Likes from before this list existed are not included.</p>
          </div>
        )}
        <EntryList entries={shown} onEdit={s.openEntry} dayHeadings={mode.kind === "newest" || mode.kind === "oldest"}
          weeks={tab === "notes" && grouping === "weeks" ? { origin: earliestDay(list) } : undefined}
          dayHours={tab === "notes"} />
      </div>
    </>
  );
}

/** Your logbook, or your profile as someone outside your friends sees it (no edit controls, public entries only). */
export default function MyLogbook() {
  const s = useSession();
  const [viewAs, setViewAs] = useState(false);
  if (!viewAs) return <Logbook onViewAs={() => setViewAs(true)} />;
  return (
    <>
      <div className="viewas-bar" role="status">
        <EyeIcon />
        <span>Viewing your profile as someone else sees it</span>
        <button type="button" className="btn small" onClick={() => setViewAs(false)}>Exit</button>
      </div>
      <PersonPage uid={s.uid} />
    </>
  );
}
