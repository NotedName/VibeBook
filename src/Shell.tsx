import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import type { Entry } from "./entries";
import { toProfile } from "./profiles";
import { useSocial } from "./social";
import { syncFriendList } from "./friendList";
import { syncActivity } from "./activity";
import { useGroupInvites, useMyGroups } from "./groups";
import { useMyReposts } from "./reposts";
import { syncEntryPrivacy } from "./entryPrivacy";
import { useGroupAlerts } from "./groupAlerts";
import { useConversations } from "./messages";
import { SessionProvider, type Session } from "./session";
import type { Profile } from "./types";
import { ArrowLeftIcon, BookIcon, CloseIcon, FeedIcon, GroupsIcon, PlusIcon, SettingsIcon, UsersIcon } from "./icons";
import EntrySheet, { type EntryPrefill } from "./EntrySheet";
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
import ArchivedPage from "./pages/ArchivedPage";
import { PersonRoute } from "./pages/PersonPage";
import PostPage from "./pages/PostPage";
import { parsePostHash } from "./share";
import { BrandName } from "./Logo";
import NotificationBell from "./NotificationBell";
import MessagesButton from "./MessagesButton";
import MessagesPage from "./pages/MessagesPage";
import ThreadPage from "./pages/ThreadPage";
import { FeedSkeleton, ProfileSkeleton } from "./Skeleton";
import { hideSplash } from "./splash";
import { useScrollLock } from "./scrollLock";

type Route =
  | { name: "me" } | { name: "archived" } | { name: "feed" } | { name: "people" } | { name: "groups" }
  | { name: "messages" } | { name: "thread"; uid: string }
  | { name: "person"; handle: string } | { name: "group"; id: string } | { name: "post"; uid: string; id: string };

function parse(hash: string): Route {
  const post = parsePostHash(hash);
  if (post) return { name: "post", uid: post.uid, id: post.id };
  if (hash.startsWith("#/u/")) return { name: "person", handle: decodeURIComponent(hash.slice(4)) }; // a username, or a uid from an older link
  if (hash.startsWith("#/m/")) return { name: "thread", uid: decodeURIComponent(hash.slice(4)) };
  if (hash.startsWith("#/g/")) return { name: "group", id: decodeURIComponent(hash.slice(4)) };
  if (hash === "#/me" || hash === "#/logbook") return { name: "me" };
  if (hash === "#/archived") return { name: "archived" };
  if (hash === "#/groups") return { name: "groups" };
  if (hash === "#/people") return { name: "people" };
  if (hash === "#/messages") return { name: "messages" };
  // The Feed is home: it is what an empty address, "#/" or "#/feed" opens.
  return { name: "feed" };
}

/**
 * Tells the CSS which way the page is being scrolled (html[data-scroll] = top | down | up), so the side panel can
 * make room while someone reads downwards and open again when they scroll back up or reach the top.
 */
function useScrollDirection() {
  useEffect(() => {
    const root = document.documentElement;
    let last = window.scrollY;
    let queued = false;
    const set = (v: string) => { if (root.dataset.scroll !== v) root.dataset.scroll = v; };
    const update = () => {
      queued = false;
      const y = window.scrollY;
      if (y < 24) { set("top"); last = y; }
      else if (y - last > 8) { set("down"); last = y; }
      else if (last - y > 8) { set("up"); last = y; }
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    set("top");
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); delete root.dataset.scroll; };
  }, []);
}

export default function Shell({ user }: { user: User }) {
  const uid = user.uid;
  useScrollDirection();
  const social = useSocial(uid);
  // Keeps the friends list other people can open in step with your real friendships (best effort).
  const friendKey = [...social.friends].sort().join(",");
  useEffect(() => {
    if (social.ready) syncFriendList(uid, social.friends).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, social.ready, friendKey]);
  // Uploads this device's activity log to your account once per visit, so it shows on your other devices too (best effort).
  useEffect(() => { syncActivity(uid).catch(() => {}); }, [uid]);
  const chats = useConversations(uid);
  const groups = useMyGroups(uid);
  const reposts = useMyReposts(uid);
  const allInvites = useGroupInvites(uid);
  // Puts your entries in line with your groups' privacy (an admin may have switched a group since you were last here). Best effort.
  useEffect(() => {
    if (groups.ready && !groups.error) syncEntryPrivacy(uid).catch(() => {});
  }, [uid, groups.ready, groups.error]);
  const groupIdList = useMemo(() => [...groups.ids].sort(), [groups.ids]);
  const { alerts: groupAlerts, markSeen: markGroupSeen } = useGroupAlerts(uid, groupIdList);
  const invites = useMemo(() => allInvites.filter((i) => !groups.ids.has(i.groupId)), [allInvites, groups.ids]);
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [profileError, setProfileError] = useState("");
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  // Pages visited inside the app, so Back never leaves it: only offered when there is somewhere in the app to go.
  const trail = useRef<string[]>([location.hash]);
  const [entrySheet, setEntrySheet] = useState<{ entry: Entry | null; groupId?: string; prefill?: EntryPrefill } | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [notice, setNotice] = useState("");
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  useScrollLock(manualCopy !== null);
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
    ...social, user, uid, me, groups, invites, reposts, groupAlerts, markGroupSeen, chats, notify,
    manualCopy: setManualCopy,
    editProfile: () => setEditingProfile(true),
    openEntry: (entry, groupId) => setEntrySheet({ entry, groupId }),
    openEntryWithHours: (prefill) => setEntrySheet({ entry: null, prefill }),
  }), [social, groups, invites, reposts, groupAlerts, markGroupSeen, chats, user, uid, me, notify]);

  if (profileError) return <p className="center error">{profileError}</p>;
  if (me === undefined) return <div className="page"><main className="logbook"><ProfileSkeleton /><FeedSkeleton /></main></div>;

  const isMe = route.name === "person" && (route.handle === uid || route.handle.toLowerCase() === me?.username);
  const active = isMe ? { name: "me" } as Route : route;
  const incomingCount = social.incoming.length;
  const subPage = active.name === "person" || active.name === "group" || active.name === "post" || active.name === "archived" || active.name === "thread";
  const backTo = active.name === "group" ? "#/groups" : active.name === "person" ? "#/people" : active.name === "archived" ? "#/me" : active.name === "thread" ? "#/messages" : "#/feed";
  const newEntry = () => setEntrySheet({ entry: null, groupId: active.name === "group" ? active.id : undefined });
  const goBack = () => { if (trail.current.length > 1) history.back(); else location.hash = backTo; };
  const tab = (href: string, on: boolean, icon: React.ReactNode, label: string, badge = 0) => (
    <a href={href} className={`tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined} title={label}>
      {icon}<span>{label}</span>{badge > 0 && <i className="badge" aria-label={`${badge} new`}>{badge}</i>}
    </a>
  );

  return (
    <SessionProvider value={session}>
      <header className={`topbar${active.name === "thread" ? " in-chat" : ""}`}>
        <div className="topbar-in">
          <a className="brand" href="#/feed"><BrandName /></a>
          <div className="top-actions">
            <MessagesButton on={active.name === "messages" || active.name === "thread"} />
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
            <button type="button" className="tab tab-new" onClick={newEntry} aria-label="New entry" title="New entry">
              <i><PlusIcon /></i><span>New</span>
            </button>
          )}
          {tab("#/people", active.name === "people" || active.name === "person", <UsersIcon />, "People", incomingCount)}
          {tab("#/me", active.name === "me" || active.name === "archived", <BookIcon />, "Logbook")}
        </nav>
      </header>

      <div className="page">
      <main className={`logbook${active.name === "thread" ? " chat-page" : ""}`}>
        {subPage && (
          <div className="backbar">
            <button type="button" className="back-btn" onClick={goBack} aria-label="Go back">
              <ArrowLeftIcon /><span>Back</span>
            </button>
          </div>
        )}
        {me && active.name === "me" && <MyLogbook />}
        {active.name === "feed" && <FeedPage />}
        {me && active.name === "archived" && <ArchivedPage />}
        {active.name === "groups" && <GroupsPage />}
        {active.name === "group" && <GroupPage key={active.id} gid={active.id} />}
        {active.name === "people" && <PeoplePage />}
        {active.name === "messages" && <MessagesPage />}
        {active.name === "thread" && <ThreadPage key={active.uid} uid={active.uid} />}
        {active.name === "person" && <PersonRoute key={active.handle} handle={active.handle} />}
        {active.name === "post" && <PostPage key={`${active.uid}/${active.id}`} uid={active.uid} id={active.id} />}
      </main>
      {me && <SideColumn onNewEntry={newEntry} groupId={active.name === "group" ? active.id : undefined} />}
      </div>

      {entrySheet && (
        <EntrySheet key={entrySheet.entry?.id ?? "new"} uid={uid} entry={entrySheet.entry} prefill={entrySheet.prefill}
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
