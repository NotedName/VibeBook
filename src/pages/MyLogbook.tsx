import { useEffect, useMemo, useRef, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { entriesRef, newestFirst, stampOf, type Entry } from "../entries";
import { useRepostedEntries } from "../reposts";
import { earliestDay } from "../weeks";
import HoursCard from "../HoursCard";
import ReportSheet from "../ReportSheet";
import { DateFilterMenu, inRange, NO_RANGE, rangeActive, RangeSummary } from "../DateRangeFilter";
import { useSession } from "../session";
import { dateDir, LOGBOOK_VIEWS, useLogbookView, useSortedEntries, useSortMode } from "../sorting";
import { useSlideOnChange } from "../slide";
import Segmented from "../Segmented";
import { useLikedEntries } from "../likes";
import ProfileTabs, { type ProfileTab } from "../ProfileTabs";
import SortMenu from "../SortMenu";
import ProfileHeader from "../ProfileHeader";
import Avatar from "../Avatar";
import EntryList from "../EntryList";
import { FeedSkeleton } from "../Skeleton";
import PersonPage from "./PersonPage";
import { DownloadIcon, EyeIcon, SearchIcon } from "../icons";
import FriendsSheet from "../FriendsSheet";
import SkillsSheet from "../SkillsSheet";
import LogbookMonth from "../LogbookMonth";
import { saveAvailability, useHoursGoal } from "../hours";
import { addHolidays, removeHoliday } from "../availability";

function Logbook({ onViewAs }: { onViewAs: () => void }) {
  const s = useSession();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [range, setRange] = useState(NO_RANGE);
  const [search, setSearch] = useState("");
  const goal = useHoursGoal(s.uid);

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
  // Notes are what you wrote; Reposts and Vibes are other people's entries. Only Notes count towards your stats and reports.
  const [tab, setTab] = useState<ProfileTab>("notes");
  const [mode, setMode] = useSortMode("logbook");
  const [view, setView] = useLogbookView("logbook");
  const content = useRef<HTMLDivElement>(null);
  useSlideOnChange(content, (["notes", "reposts", "likes"] as const).indexOf(tab) * 10 + LOGBOOK_VIEWS.findIndex((v) => v.id === view));
  const myUid = useMemo(() => [s.uid], [s.uid]);
  const reposts = useRepostedEntries(myUid, 50, dateDir(mode));
  const likes = useLikedEntries(s.uid, tab === "likes");
  // Searching always looks through your own notes, whichever tab is open; the sort and date filter apply to the results too.
  const q = search.trim().toLowerCase();
  const searching = q !== "";
  const matches = useMemo(
    () => (searching ? list.filter((e) => [e.title, e.description, ...e.skills].some((t) => t.toLowerCase().includes(q))) : list),
    [list, q, searching],
  );
  const notesShown = tab === "notes" || searching;
  const monthOn = tab === "notes" && view === "months" && !searching;
  const pool = searching ? matches : tab === "notes" ? list : tab === "reposts" ? reposts : likes.entries;
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
          {stats.map(([label, n]) => label === "Friends" || label === "Skills" ? (
            <button type="button" className="stat stat-btn" key={label} onClick={() => (label === "Friends" ? setFriendsOpen(true) : setSkillsOpen(true))}><b>{n}</b><span>{label}</span></button>
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
      {skillsOpen && <SkillsSheet entries={list} onClose={() => setSkillsOpen(false)} />}
      {friendsOpen && <FriendsSheet uid={s.uid} onClose={() => setFriendsOpen(false)} />}
      <ProfileTabs tab={tab} onChange={setTab} showLikes />

      <div className="logbook-tools">
        <label className="search">
          <SearchIcon />
          <input type="search" value={search} placeholder="Search your notes" aria-label="Search your notes" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <DateFilterMenu value={range} onChange={setRange} />
        {pool.length > 1 && <SortMenu mode={mode} onChange={setMode} />}
      </div>

      {tab === "notes" && !searching && (
        <Segmented className="view-toggle" label="Logbook view" value={view} options={LOGBOOK_VIEWS} onChange={setView} />
      )}

      {!monthOn && <RangeSummary value={range} onChange={setRange} shown={filtered.length} total={pool.length} />}

      {loadError && <p className="error note" role="alert">{loadError}</p>}

      <div ref={content} className="slide-pane">
      {monthOn && entries !== null && goal.ready && (
        <LogbookMonth entries={list} availability={goal.availability} onEdit={s.openEntry} onAdd={(date) => s.openEntry(null, undefined, date)}
          onMarkDay={(date, reason) => saveAvailability(s.uid, reason === null ? removeHoliday(goal.availability, date) : addHolidays(goal.availability, [date], reason), !!s.me && s.me.scheduleAudience !== "private")} />
      )}

      <div className="feed" aria-live="polite" style={monthOn ? { display: "none" } : undefined}>
        {entries === null && <FeedSkeleton />}
        {tab === "notes" && !searching && entries !== null && pool.length === 0 && !loadError && (
          <div className="empty">
            <h2>Your logbook is empty</h2>
            <p>Add what you did today with a photo, the skills you picked up and a short description. Entries show up here, newest first.</p>
            <button type="button" className="btn primary" onClick={() => s.openEntry(null)}>Write the first entry</button>
          </div>
        )}
        {searching && pool.length === 0 && entries !== null && (
          <div className="empty">
            <h2>No notes found</h2>
            <p>None of your notes match “{search.trim()}”.</p>
            <button type="button" className="btn primary" onClick={() => setSearch("")}>Clear search</button>
          </div>
        )}
        {rangeActive(range) && pool.length > 0 && shown.length === 0 && (
          <div className="empty">
            <h2>Nothing in these dates</h2>
            <p>No entries fall between the dates you picked.</p>
            <button type="button" className="btn primary" onClick={() => setRange(NO_RANGE)}>Clear the dates</button>
          </div>
        )}
        {tab === "reposts" && !searching && pool.length === 0 && (
          <div className="empty">
            <h2>No reposts yet</h2>
            <p>Tap Repost on a public entry to add it here and show it to your friends.</p>
            <a className="btn primary" href="#/feed">Browse the feed</a>
          </div>
        )}
        {tab === "likes" && !searching && likes.loading && pool.length === 0 && <FeedSkeleton />}
        {tab === "likes" && !searching && !likes.loading && pool.length === 0 && (
          <div className="empty">
            <h2>Nothing liked yet</h2>
            <p>Entries you give a Vibe show up here, only for you. Vibes from before this list existed are not included.</p>
          </div>
        )}
        <EntryList entries={shown} onEdit={s.openEntry} dayHeadings={mode.kind === "newest" || mode.kind === "oldest"}
          weeks={notesShown && view === "weeks" ? { origin: earliestDay(list) } : undefined}
          dayHours={notesShown} hoursSource={hoursList} />
      </div>
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
