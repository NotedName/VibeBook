import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { Entry } from "./entries";
import { toProfile } from "./profiles";
import { useSocial } from "./social";
import { useMyGroups } from "./groups";
import { SessionProvider, type Session } from "./session";
import { useTheme } from "./theme";
import type { Profile } from "./types";
import { BookIcon, CloseIcon, FeedIcon, GroupsIcon, MoonIcon, SunIcon, UsersIcon } from "./icons";
import EntrySheet from "./EntrySheet";
import ProfileSheet from "./ProfileSheet";
import MyLogbook from "./pages/MyLogbook";
import FeedPage from "./pages/FeedPage";
import GroupsPage from "./pages/GroupsPage";
import GroupPage from "./pages/GroupPage";
import PeoplePage from "./pages/PeoplePage";
import PersonPage from "./pages/PersonPage";
import PostPage from "./pages/PostPage";
import { parsePostHash } from "./share";
import { BrandName } from "./Logo";

type Route =
  | { name: "me" } | { name: "feed" } | { name: "people" } | { name: "groups" }
  | { name: "person"; uid: string } | { name: "group"; id: string } | { name: "post"; uid: string; id: string };

function parse(hash: string): Route {
  const post = parsePostHash(hash);
  if (post) return { name: "post", uid: post.uid, id: post.id };
  if (hash.startsWith("#/u/")) return { name: "person", uid: decodeURIComponent(hash.slice(4)) };
  if (hash.startsWith("#/g/")) return { name: "group", id: decodeURIComponent(hash.slice(4)) };
  if (hash === "#/feed") return { name: "feed" };
  if (hash === "#/groups") return { name: "groups" };
  if (hash === "#/people") return { name: "people" };
  return { name: "me" };
}

export default function Shell({ user }: { user: User }) {
  const uid = user.uid;
  const social = useSocial(uid);
  const groups = useMyGroups(uid);
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [profileError, setProfileError] = useState("");
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  const [entrySheet, setEntrySheet] = useState<{ entry: Entry | null; groupId?: string } | null>(null);
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
    ...social, user, uid, me, groups, notify,
    manualCopy: setManualCopy,
    editProfile: () => setEditingProfile(true),
    openEntry: (entry, groupId) => setEntrySheet({ entry, groupId }),
  }), [social, groups, user, uid, me, notify]);

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
          <a className="brand" href="#/"><BrandName /></a>
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
          {tab("#/groups", active.name === "groups" || active.name === "group", <GroupsIcon />, "Groups")}
          {tab("#/people", active.name === "people" || active.name === "person", <UsersIcon />, "People", incomingCount)}
        </nav>
      </header>

      <main className="logbook">
        {me && active.name === "me" && <MyLogbook />}
        {active.name === "feed" && <FeedPage />}
        {active.name === "groups" && <GroupsPage />}
        {active.name === "group" && <GroupPage key={active.id} gid={active.id} />}
        {active.name === "people" && <PeoplePage />}
        {active.name === "person" && <PersonPage key={active.uid} uid={active.uid} />}
        {active.name === "post" && <PostPage key={`${active.uid}/${active.id}`} uid={active.uid} id={active.id} />}
      </main>

      {me && active.name !== "person" && (
        <button type="button" className="fab"
          onClick={() => setEntrySheet({ entry: null, groupId: active.name === "group" ? active.id : undefined })}>+ New entry</button>
      )}

      {entrySheet && (
        <EntrySheet key={entrySheet.entry?.id ?? "new"} uid={uid} entry={entrySheet.entry}
          defaultGroupId={entrySheet.groupId} onClose={closeEntry} onSaved={entrySaved} />
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
