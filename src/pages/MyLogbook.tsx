import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { entriesRef, type Entry } from "../entries";
import { allDescriptions, copyText, dailyReport, longDay, todayStr } from "../report";
import { useSession } from "../session";
import ProfileHeader from "../ProfileHeader";
import Avatar from "../Avatar";
import EntryList from "../EntryList";
import { EditIcon } from "../icons";

export default function MyLogbook() {
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

  const list = useMemo(
    () => [...(entries ?? [])].sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1)),
    [entries],
  );
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
      <ProfileHeader profile={s.me}>
        <div className="profile-actions">
          <button type="button" className="btn" onClick={s.editProfile}><EditIcon /> Edit profile</button>
        </div>

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
        {entries === null && <p className="note">Loading your logbook…</p>}
        {entries !== null && list.length === 0 && !loadError && (
          <div className="empty">
            <h2>Your logbook is empty</h2>
            <p>Add what you did today with a photo, the skills you picked up and a short description. Entries show up here, newest first.</p>
            <button type="button" className="btn primary" onClick={() => s.openEntry(null)}>Write the first entry</button>
          </div>
        )}
        <EntryList entries={list} onEdit={s.openEntry} />
      </div>
    </>
  );
}
