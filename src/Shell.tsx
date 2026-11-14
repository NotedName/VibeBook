import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import type { Entry } from "./entries";
import { toProfile } from "./profiles";
import { useSocial } from "./social";
import { useGroupInvites, useMyGroups } from "./groups";
import { useMyReposts } from "./reposts";
import { useGroupAlerts } from "./groupAlerts";
import { SessionProvider, type Session } from "./session";
import type { Profile } from "./types";
import { ArrowLeftIcon, BookIcon, CloseIcon, FeedIcon, GroupsIcon, PlusIcon, SettingsIcon, UsersIcon } from "./icons";
import EntrySheet from "./EntrySheet";
import SideColumn from "./SideColumn";
import ProfileSheet from "./ProfileSheet";
import SettingsSheet from "./SettingsSheet";
import AccountSheet from "./AccountSheet";
import Avatar from "./Avatar";
import MyLogbook from "./pages/MyLogbook";
import FeedPage from "./pages/FeedPage";
import GroupsPage from "./pages/GroupsPage";
import GroupPage from "./pages/GroupPage";
import PeoplePage from "./pages/PeoplePage";
import { PersonRoute } from "./pages/PersonPage";
import PostPage from "./pages/PostPage";
import { parsePostHash } from "./share";
import { BrandName } from "./Logo";
import NotificationBell from "./NotificationBell";
import { FeedSkeleton, ProfileSkeleton } from "./Skeleton";
import { hideSplash } from "./splash";

type Route =
  | { name: "me" } | { name: "feed" } | { name: "people" } | { name: "groups" }
  | { name: "person"; handle: string } | { name: "group"; id: string } | { name: "post"; uid: string; id: string };

function parse(hash: string): Route {
  const post = parsePostHash(hash);
  if (post) return { name: "post", uid: post.uid, id: post.id };
  if (hash.startsWith("#/u/")) return { name: "person", handle: decodeURIComponent(hash.slice(4)) }; // a username, or a uid from an older link
  if (hash.startsWith("#/g/")) return { name: "group", id: decodeURIComponent(hash.slice(4)) };
  if (hash === "#/me" || hash === "#/logbook") return { name: "me" };
  if (hash === "#/groups") return { name: "groups" };
  if (hash === "#/people") return { name: "people" };
  // The Feed is home: it is what an empty address, "#/" or "#/feed" opens.
  return { name: "feed" };
}

export default function Shell({ user }: { user: User }) {
  const uid = user.uid;
  const social = useSocial(uid);
  const groups = useMyGroups(uid);
  const reposts = useMyReposts(uid);
  const allInvites = useGroupInvites(uid);
  const groupIdList = useMemo(() => [...groups.ids].sort(), [groups.ids]);
  const { alerts: groupAlerts, markSeen: markGroupSeen } = useGroupAlerts(uid, groupIdList);
  const invites = useMemo(() => allInvites.filter((i) => !groups.ids.has(i.groupId)), [allInvites, groups.ids]);
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [profileError, setProfileError] = useState("");
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  // Pages visited inside the app, so Back never leaves it: only offered when there is somewhere in the app to go.
  const trail = useRef<string[]>([location.hash]);
  const [entrySheet, setEntrySheet] = useState<{ entry: Entry | null; groupId?: string } | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => onSnapshot(
      doc(db, "profiles", uid),
      (snap) => { setMe(snap.exists() ? toProfile(uid, snap.data() as Partial<Profile>) : null); setProfileError(""); },
      () => setProfileError("Could not load your profile. If you just updated the app, deploy the Firestore rules first (npm run deploy)."),
    ),
    [uid],
  );

  // Profile answered (or failed): there is something to show, so let the splash screen go.
  useEffect(() => {
    if (me !== undefined || profileError) hideSplash();
  }, [me, profileError]);

  useEffect(() => {
    const onHash = () => {
      const t = trail.current;
      if (t.length > 1 && t[t.length - 2] === location.hash) t.pop(); // went back
      else if (t[t.length - 1] !== location.hash) t.push(location.hash);
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
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
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  const entrySaved = useCallback((message: string) => { setEntrySheet(null); notify(message); }, [notify]);

  const session = useMemo<Session>(() => ({
    ...social, user, uid, me, groups, invites, reposts, groupAlerts, markGroupSeen, notify,
    manualCopy: setManualCopy,
    editProfile: () => setEditingProfile(true),
    openEntry: (entry, groupId) => setEntrySheet({ entry, groupId }),
  }), [social, groups, invites, reposts, groupAlerts, markGroupSeen, user, uid, me, notify]);

  if (profileError) return <p className="center error">{profileError}</p>;
  if (me === undefined) return <div className="page"><main className="logbook"><ProfileSkeleton /><FeedSkeleton /></main></div>;

  const isMe = route.name === "person" && (route.handle === uid || route.handle.toLowerCase() === me?.username);
  const active = isMe ? { name: "me" } as Route : route;
  const incomingCount = social.incoming.length;
  const subPage = active.name === "person" || active.name === "group" || active.name === "post";
  const backTo = active.name === "group" ? "#/groups" : active.name === "person" ? "#/people" : "#/feed";
  const newEntry = () => setEntrySheet({ entry: null, groupId: active.name === "group" ? active.id : undefined });
  const goBack = () => { if (trail.current.length > 1) history.back(); else location.hash = backTo; };
  const tab = (href: string, on: boolean, icon: React.ReactNode, label: string, badge = 0) => (
    <a href={href} className={`tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>
      {icon}<span>{label}</span>{badge > 0 && <i className="badge" aria-label={`${badge} new`}>{badge}</i>}
    </a>
  );

  return (
    <SessionProvider value={session}>
      <header className="topbar">
        <div className="topbar-in">
          <a className="brand" href="#/feed"><BrandName /></a>
          <div className="top-actions">
            <NotificationBell />
            <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)}
              aria-label="Settings" aria-haspopup="dialog">
              <SettingsIcon />
            </button>
            <button type="button" className="icon-btn avatar-btn" onClick={() => setAccountOpen(true)}
              aria-label="Account" aria-haspopup="dialog">
              <Avatar profile={me} />
            </button>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {tab("#/feed", active.name === "feed", <FeedIcon />, "Feed")}
          {tab("#/groups", active.name === "groups" || active.name === "group", <GroupsIcon />, "Groups", invites.length)}
          {me && (
            <button type="button" className="tab tab-new" onClick={newEntry} aria-label="New entry">
              <i><PlusIcon /></i><span>New</span>
            </button>
          )}
          {tab("#/people", active.name === "people" || active.name === "person", <UsersIcon />, "People", incomingCount)}
          {tab("#/me", active.name === "me", <BookIcon />, "Logbook")}
        </nav>
      </header>

      <div className="page">
      <main className="logbook">
        {subPage && (
          <div className="backbar">
            <button type="button" className="back-btn" onClick={goBack} aria-label="Go back">
              <ArrowLeftIcon /><span>Back</span>
            </button>
          </div>
        )}
        {me && active.name === "me" && <MyLogbook />}
        {active.name === "feed" && <FeedPage />}
        {active.name === "groups" && <GroupsPage />}
        {active.name === "group" && <GroupPage key={active.id} gid={active.id} />}
        {active.name === "people" && <PeoplePage />}
        {active.name === "person" && <PersonRoute key={active.handle} handle={active.handle} />}
        {active.name === "post" && <PostPage key={`${active.uid}/${active.id}`} uid={active.uid} id={active.id} />}
      </main>
      {me && <SideColumn onNewEntry={newEntry} />}
      </div>

      {entrySheet && (
        <EntrySheet key={entrySheet.entry?.id ?? "new"} uid={uid} entry={entrySheet.entry}
          defaultGroupId={entrySheet.groupId} onClose={closeEntry} onSaved={entrySaved} />
      )}
      {(me === null || editingProfile || !me.username) && (
        <ProfileSheet profile={me} suggestedName={user.displayName ?? ""} onClose={closeProfile} />
      )}

      {settingsOpen && <SettingsSheet onClose={closeSettings} />}
      {accountOpen && <AccountSheet email={user.email ?? ""} onClose={closeAccount} />}

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
