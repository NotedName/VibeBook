import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut, updateProfile, type User } from "firebase/auth";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { auth } from "./firebase";
import { entriesRef, type Entry } from "./entries";
import { allDescriptions, copyText, dailyReport, initials, longDay, todayStr } from "./report";
import { useTheme } from "./theme";
import { CloseIcon, MoonIcon, SunIcon } from "./icons";
import EntrySheet from "./EntrySheet";
import EntryCard from "./EntryCard";

const fallbackName = (user: User) => user.displayName?.trim() || user.email?.split("@")[0] || "You";

export default function Logbook({ user }: { user: User }) {
  const uid = user.uid;
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState(fallbackName(user));
  const [editingName, setEditingName] = useState(false);
  const [sheet, setSheet] = useState<{ entry: Entry | null } | null>(null);
  const [reportDate, setReportDate] = useState(todayStr());
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [theme, toggleTheme] = useTheme();
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () =>
      onSnapshot(
        query(entriesRef(uid), orderBy("date", "desc")),
        (snap) => {
          setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry));
          setLoadError("");
        },
        () => { setEntries([]); setLoadError("Could not load your entries. Check your connection."); },
      ),
    [uid],
  );

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2200);
  }, []);
  const closeSheet = useCallback(() => setSheet(null), []);
  const saved = useCallback((message: string) => { setSheet(null); showNotice(message); }, [showNotice]);

  const list = useMemo(
    () => [...(entries ?? [])].sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1)),
    [entries],
  );
  const stats = useMemo(() => {
    const days = new Set(list.map((e) => e.date));
    const skills = new Set(list.flatMap((e) => e.skills.map((s) => s.toLowerCase())));
    return [["Entries", list.length], ["Days logged", days.size], ["Skills", skills.size]] as const;
  }, [list]);

  async function copy(text: string, ok: string) {
    if (await copyText(text)) showNotice(ok);
    else setManualCopy(text);
  }
  function copyReport() {
    const text = dailyReport(list, reportDate);
    if (!text) return showNotice(`No entries on ${longDay(reportDate)}`);
    copy(text, "Daily report copied");
  }
  function copyDescriptions() {
    const text = allDescriptions(list);
    if (!text) return showNotice("No descriptions to copy yet");
    copy(text, "Descriptions copied");
  }
  async function commitName(value: string) {
    setEditingName(false);
    const next = value.trim();
    if (!next || next === name) return;
    setName(next);
    try { await updateProfile(user, { displayName: next }); }
    catch { showNotice("Could not save your name"); }
  }

  let lastDate = "";
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand"><span className="brand-mark" aria-hidden="true">L</span>OJT Logbook</div>
          <div className="top-actions">
            <button type="button" className="icon-btn" onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <button type="button" className="btn small" onClick={() => signOut(auth)}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="logbook">
        <section className="profile" aria-label="Profile">
          <div className="cover" aria-hidden="true" />
          <div className="pad">
            <div className="who">
              <div className="avatar" aria-hidden="true">{initials(name)}</div>
              <div className="who-text">
                {editingName ? (
                  <input className="name-input" aria-label="Your name" defaultValue={name} maxLength={60}
                    autoFocus onFocus={(e) => e.target.select()}
                    onBlur={(e) => commitName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditingName(false);
                    }} />
                ) : (
                  <button type="button" className="name-btn" onClick={() => setEditingName(true)}
                    aria-label="Edit your name">{name}</button>
                )}
                <div className="role">OJT intern</div>
              </div>
            </div>

            <div className="stats">
              {stats.map(([label, n]) => (
                <div className="stat" key={label}><b>{n}</b><span>{label}</span></div>
              ))}
            </div>

            <div className="report-row">
              <button type="button" className="btn primary grow" onClick={copyReport}>Copy for Daily Report</button>
              <button type="button" className="btn grow" onClick={copyDescriptions}>Copy descriptions</button>
              <label className="report-date">Report date
                <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value || todayStr())} />
              </label>
            </div>
          </div>
        </section>

        <div className="composer">
          <div className="avatar-sm" aria-hidden="true">{initials(name)}</div>
          <button type="button" className="composer-input" onClick={() => setSheet({ entry: null })}>
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
              <button type="button" className="btn primary" onClick={() => setSheet({ entry: null })}>
                Write the first entry
              </button>
            </div>
          )}
          {list.map((e) => {
            const header = e.date !== lastDate;
            lastDate = e.date;
            return (
              <div key={e.id}>
                {header && <div className="day-label">{longDay(e.date)}</div>}
                <EntryCard uid={uid} name={name} entry={e}
                  onEdit={(entry) => setSheet({ entry })}
                  onNotice={showNotice} onManualCopy={setManualCopy} />
              </div>
            );
          })}
        </div>
      </main>

      <button type="button" className="fab" onClick={() => setSheet({ entry: null })}>+ New entry</button>

      {sheet && <EntrySheet key={sheet.entry?.id ?? "new"} uid={uid} entry={sheet.entry} onClose={closeSheet} onSaved={saved} />}

      {manualCopy !== null && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setManualCopy(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Copy text">
            <div className="sheet-head">
              <h2>Copy this text</h2>
              <button type="button" className="icon-btn close" aria-label="Close" onClick={() => setManualCopy(null)}><CloseIcon /></button>
            </div>
            <div className="sheet-body">
              <p className="hint">Your browser blocked automatic copying. Select the text and copy it.</p>
              <textarea readOnly rows={10} value={manualCopy} autoFocus onFocus={(e) => e.target.select()} />
            </div>
          </div>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </>
  );
}
