import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { entriesRef, newestFirst, type Entry } from "../entries";
import { useRepostedEntries } from "../reposts";
import { allDescriptions, copyText, dailyReport, longDay, todayStr } from "../report";
import { useSession } from "../session";
import { useSortedEntries, useSortMode } from "../sorting";
import SortBar from "../SortBar";
import ProfileHeader from "../ProfileHeader";
import Avatar from "../Avatar";
import EntryList from "../EntryList";
import { FeedSkeleton } from "../Skeleton";
import PersonPage from "./PersonPage";
import { EyeIcon } from "../icons";

function Logbook({ onViewAs }: { onViewAs: () => void }) {
  const s = useSession();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reportDate, setReportDate] = useState(todayStr());

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

  const list = useMemo(() => [...(entries ?? [])].sort(newestFirst), [entries]);
  // Things you reposted sit in your logbook too, but do not count towards your stats or reports.
  const myUid = useMemo(() => [s.uid], [s.uid]);
  const reposts = useRepostedEntries(myUid);
  const pool = useMemo(() => [...list, ...reposts].sort(newestFirst), [list, reposts]);
  const [mode, setMode] = useSortMode("logbook");
  const shown = useSortedEntries(pool, mode);
  const stats = useMemo(() => {
    const days = new Set(list.map((e) => e.date));
    const skills = new Set(list.flatMap((e) => e.skills.map((x) => x.toLowerCase())));
    return [["Entries", list.length], ["Days", days.size], ["Skills", skills.size], ["Friends", s.friends.size]] as const;
  }, [list, s.friends]);

  async function copy(text: string, ok: string) {
    if (await copyText(text)) s.notify(ok);
    else s.manualCopy(text);
  }
  function copyReport() {
    const text = dailyReport(list, reportDate);
    if (!text) return s.notify(`No entries on ${longDay(reportDate)}`);
    copy(text, "Daily report copied");
  }
  function copyDescriptions() {
    const text = allDescriptions(list);
    if (!text) return s.notify("No descriptions to copy yet");
    copy(text, "Descriptions copied");
  }

  if (!s.me) return null;
  return (
    <>
      <ProfileHeader profile={s.me} editable onEditProfile={s.editProfile} onViewAs={onViewAs}>
        <div className="stats">
          {stats.map(([label, n]) => (
            <div className="stat" key={label}><b>{n}</b><span>{label}</span></div>
          ))}
        </div>

        <div className="report">
          <label className="report-date">Report for
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value || todayStr())} />
          </label>
          <div className="report-btns">
            <button type="button" className="btn primary" onClick={copyReport}>Copy for Daily Report</button>
            <button type="button" className="btn" onClick={copyDescriptions}>Copy descriptions</button>
          </div>
        </div>
      </ProfileHeader>

      <div className="composer">
        <Avatar profile={s.me} />
        <button type="button" className="composer-input" onClick={() => s.openEntry(null)}>
          What did you work on today?
        </button>
      </div>

      {loadError && <p className="error note" role="alert">{loadError}</p>}

      <div className="feed" aria-live="polite">
        {entries === null && <FeedSkeleton />}
        {entries !== null && shown.length === 0 && !loadError && (
          <div className="empty">
            <h2>Your logbook is empty</h2>
            <p>Add what you did today with a photo, the skills you picked up and a short description. Entries show up here, newest first.</p>
            <button type="button" className="btn primary" onClick={() => s.openEntry(null)}>Write the first entry</button>
          </div>
        )}
        {shown.length > 1 && <SortBar mode={mode} onChange={setMode} />}
        <EntryList entries={shown} onEdit={s.openEntry} dayHeadings={mode.kind === "newest" || mode.kind === "oldest"} />
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
