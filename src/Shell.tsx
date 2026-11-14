import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { Entry } from "./entries";
import { toProfile } from "./profiles";
import { useSocial } from "./social";
import { SessionProvider, type Session } from "./session";
import { useTheme } from "./theme";
import type { Profile } from "./types";
import { BookIcon, CloseIcon, FeedIcon, MoonIcon, SunIcon, UsersIcon } from "./icons";
import EntrySheet from "./EntrySheet";
import ProfileSheet from "./ProfileSheet";
import MyLogbook from "./pages/MyLogbook";
import FeedPage from "./pages/FeedPage";
import PeoplePage from "./pages/PeoplePage";
import PersonPage from "./pages/PersonPage";

type Route = { name: "me" } | { name: "feed" } | { name: "people" } | { name: "person"; uid: string };

function parse(hash: string): Route {
  if (hash.startsWith("#/u/")) return { name: "person", uid: decodeURIComponent(hash.slice(4)) };
  if (hash === "#/feed") return { name: "feed" };
  if (hash === "#/people") return { name: "people" };
  return { name: "me" };
}

export default function Shell({ user }: { user: User }) {
  const uid = user.uid;
  const social = useSocial(uid);
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [profileError, setProfileError] = useState("");
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  const [entrySheet, setEntrySheet] = useState<{ entry: Entry | null } | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [theme, toggleTheme] = useTheme();
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => onSnapshot(
      doc(db, "profiles", uid),
      (snap) => { setMe(snap.exists() ? toProfile(uid, snap.data() as Partial<Profile>) : null); setProfileError(""); },
      () => setProfileError("Could not load your profile. If you just updated the app, deploy the Firestore rules first (npm run deploy)."),
    ),
    [uid],
  );

  useEffect(() => {
    const onHash = () => { setRoute(parse(location.hash)); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const notify = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2200);
  }, []);
  const closeEntry = useCallback(() => setEntrySheet(null), []);
  const closeProfile = useCallback(() => setEditingProfile(false), []);
  const entrySaved = useCallback((message: string) => { setEntrySheet(null); notify(message); }, [notify]);

  const session = useMemo<Session>(() => ({
    ...social, user, uid, me, notify,
    manualCopy: setManualCopy,
    editProfile: () => setEditingProfile(true),
    openEntry: (entry) => setEntrySheet({ entry }),
  }), [social, user, uid, me, notify]);

  if (profileError) return <p className="center error">{profileError}</p>;
  if (me === undefined) return <p className="center">Loading…</p>;

  const active = route.name === "person" && route.uid === uid ? { name: "me" } as Route : route;
  const incomingCount = social.incoming.length;
  const tab = (href: string, on: boolean, icon: React.ReactNode, label: string, badge = 0) => (
    <a href={href} className={`tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
      {icon}<span>{label}</span>{badge > 0 && <i className="badge" aria-label={`${badge} new`}>{badge}</i>}
    </a>
  );

  return (
    <SessionProvider value={session}>
      <header className="topbar">
        <div className="topbar-in">
          <a className="brand" href="#/"><span className="brand-mark" aria-hidden="true">V</span>VibeBook</a>
          <div className="top-actions">
            <button type="button" className="icon-btn" onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <button type="button" className="btn small" onClick={() => signOut(auth)}>Sign out</button>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {tab("#/", active.name === "me", <BookIcon />, "Logbook")}
          {tab("#/feed", active.name === "feed", <FeedIcon />, "Feed")}
          {tab("#/people", active.name === "people" || active.name === "person", <UsersIcon />, "People", incomingCount)}
        </nav>
      </header>

      <main className="logbook">
        {me && active.name === "me" && <MyLogbook />}
        {active.name === "feed" && <FeedPage />}
        {active.name === "people" && <PeoplePage />}
        {active.name === "person" && <PersonPage key={active.uid} uid={active.uid} />}
      </main>

      {me && active.name !== "person" && (
        <button type="button" className="fab" onClick={() => setEntrySheet({ entry: null })}>+ New entry</button>
      )}

      {entrySheet && (
        <EntrySheet key={entrySheet.entry?.id ?? "new"} uid={uid} entry={entrySheet.entry} onClose={closeEntry} onSaved={entrySaved} />
      )}
      {(me === null || editingProfile) && (
        <ProfileSheet profile={me} suggestedName={user.displayName ?? ""} onClose={closeProfile} />
      )}

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
    </SessionProvider>
  );
}
