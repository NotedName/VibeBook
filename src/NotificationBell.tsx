import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { ago, markRead, noteHref, removeNotes, useNoteItems, useNotesState, type NoteItem } from "./notifications";
import { useProfile, useSession } from "./session";
import { usePreferences } from "./preferences";
import type { GroupAlert } from "./groupAlerts";
import Avatar from "./Avatar";
import { BellIcon, CheckIcon, CloseIcon, GroupsIcon, TrashIcon } from "./icons";
import { useScrollLock } from "./scrollLock";
import { RowsSkeleton } from "./Skeleton";

const nameOf = (p: { displayName: string } | null | undefined) => p?.displayName || "Someone";

function ActorAvatar({ uid }: { uid: string }) {
  return <Avatar profile={useProfile(uid)} size="sm" />;
}

/** "Ana", "Ana and Ben", "Ana, Ben and Cy", or "Ana, Ben and 4 others". */
function Who({ actors }: { actors: string[] }) {
  const a = nameOf(useProfile(actors[0]));
  const b = nameOf(useProfile(actors[1]));
  const c = nameOf(useProfile(actors[2]));
  if (actors.length === 1) return <b>{a}</b>;
  if (actors.length === 2) return <><b>{a}</b> and <b>{b}</b></>;
  if (actors.length === 3) return <><b>{a}</b>, <b>{b}</b> and <b>{c}</b></>;
  const more = actors.length - 2;
  return <><b>{a}</b>, <b>{b}</b> and {more} others</>;
}

function Title({ text }: { text?: string }) {
  return text ? <b className="note-title">“{text}”</b> : <>an entry</>;
}

function What({ item }: { item: NoteItem }) {
  const n = item.notes[0];
  const many = item.actors.length > 1;
  const times = item.notes.length > item.actors.length && item.actors.length === 1 ? ` ×${item.notes.length}` : "";
  const t = <Title text={n.title} />;
  let body: ReactNode;
  switch (n.type) {
    case "friend_request": body = many ? "sent you friend requests" : "sent you a friend request"; break;
    case "friend_accept": body = many ? "accepted your friend requests" : "accepted your friend request"; break;
    case "follow": body = "started following you"; break;
    case "group_invite":
      body = item.compiled ? "invited you to join groups" : <>invited you to join <b className="note-title">{n.groupName || "a group"}</b></>;
      break;
    case "group_request": body = <>asked to join <b className="note-title">{n.groupName || "your group"}</b></>; break;
    case "group_approved": body = <>approved your request to join <b className="note-title">{n.groupName || "a group"}</b></>; break;
    case "like": body = n.photoId ? <>vibed a photo in {t}</> : <>vibed {t}</>; break;
    case "comment": body = n.photoId ? <>commented on a photo in {t}</> : <>commented on {t}</>; break;
    case "reply": body = <>replied to your comment on {t}</>; break;
    case "comment_like": body = <>liked your comment on {t}</>; break;
    case "repost": body = <>reposted {t}</>; break;
  }
  return <>{body}{times}</>;
}


/** How far (px) a row must be dragged sideways to count as "mark as read". */
const SWIPE_AT = 72;

/**
 * Drag a notification left or right to mark it read. Vertical movement still scrolls the list (touch-action: pan-y),
 * and a drag never counts as a tap, so it does not open the notification. Read notifications do not move.
 */
function SwipeToRead({ enabled, onRead, children }: { enabled: boolean; onRead: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const st = useRef({ x: 0, y: 0, id: -1, live: false, moved: false });

  function down(e: RPointerEvent<HTMLDivElement>) {
    if (!enabled || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    st.current = { x: e.clientX, y: e.clientY, id: e.pointerId, live: false, moved: false };
  }
  function move(e: RPointerEvent<HTMLDivElement>) {
    const s = st.current;
    if (s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.live) {
      if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(my) * 1.3) return;
      s.live = true; s.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    setDx(Math.max(-160, Math.min(160, mx)));
  }
  function end(e: RPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const s = st.current;
    if (s.id !== e.pointerId) return;
    s.id = -1;
    if (!s.live) return;
    s.live = false;
    setDragging(false);
    const passed = !cancelled && Math.abs(e.clientX - s.x) >= SWIPE_AT;
    setDx(0);
    if (passed) onRead();
  }

  return (
    <div className={`note-swipe${dragging ? " dragging" : ""}`}
      onPointerDown={down} onPointerMove={move}
      onPointerUp={(e) => end(e, false)} onPointerCancel={(e) => end(e, true)}
      // a drag ends in a click on the link underneath: swallow that one
      onClickCapture={(e) => { if (st.current.moved) { e.preventDefault(); e.stopPropagation(); st.current.moved = false; } }}>
      <div className="note-swipe-bg" aria-hidden="true"
        style={{ opacity: Math.min(1, Math.abs(dx) / SWIPE_AT), justifyContent: dx < 0 ? "flex-end" : "flex-start" }}>
        <CheckIcon /> Mark as read
      </div>
      <div className="note-swipe-fg" style={{ transform: dx ? `translateX(${dx}px)` : undefined }}>{children}</div>
    </div>
  );
}

function Row({ item, onOpen, onRead }: { item: NoteItem; onOpen: (item: NoteItem) => void; onRead: (item: NoteItem) => void }) {
  const shown = item.actors.slice(0, 3);
  return (
    <li>
      <SwipeToRead enabled={item.unread} onRead={() => onRead(item)}>
        <a className={`note-row${item.unread ? " unread" : ""}`} href={noteHref(item)} draggable={false} onClick={() => onOpen(item)}>
          <span className={`note-avatars${shown.length > 1 ? " stack" : ""}`}>
            {shown.map((u) => <ActorAvatar key={u} uid={u} />)}
          </span>
          <span className="note-text">
            <span><Who actors={item.actors} /> <What item={item} /></span>
            <time>{ago(item.time)}</time>
          </span>
          {item.unread && <i className="note-dot" aria-label="Unread" />}
        </a>
      </SwipeToRead>
    </li>
  );
}

function GroupAlertRow({ alert, onOpen, onRead }: { alert: GroupAlert; onOpen: (gid: string) => void; onRead: (gid: string) => void }) {
  const { groups } = useSession();
  const name = groups.list.find((g) => g.id === alert.gid)?.name || "a group";
  return (
    <li>
      <SwipeToRead enabled onRead={() => onRead(alert.gid)}>
        <a className="note-row unread" href={`#/g/${encodeURIComponent(alert.gid)}`} draggable={false} onClick={() => onOpen(alert.gid)}>
          <span className="note-avatars"><span className="av av-sm" aria-hidden="true"><GroupsIcon /></span></span>
          <span className="note-text">
            <span><b>{alert.count === 1 ? "1 new post" : `${alert.count} new posts`}</b> in <b className="note-title">{name}</b></span>
          </span>
          <i className="note-dot" aria-label="Unread" />
        </a>
      </SwipeToRead>
    </li>
  );
}

function NotificationsSheet({ items, loading, alerts, unreadIds, onOpen, onOpenGroup, onClose }: {
  items: NoteItem[]; loading: boolean; alerts: GroupAlert[]; unreadIds: string[]; onOpen: (item: NoteItem) => void; onOpenGroup: (gid: string) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Clear all deletes them for good, so the first press only arms the button (it disarms itself after a few seconds)
  const [armed, setArmed] = useState(false);
  const s = useSession();
  useScrollLock();
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  async function markAll() {
    setBusy(true);
    alerts.forEach((a) => s.markGroupSeen(a.gid));
    try { await markRead(s.uid, unreadIds); }
    catch (err) { console.error("Mark all as read failed", err); s.notify("Could not mark them as read"); }
    finally { setBusy(false); }
  }

  async function clearAll() {
    if (!armed) { setArmed(true); return; }
    setArmed(false);
    setBusy(true);
    alerts.forEach((a) => s.markGroupSeen(a.gid)); // new-post alerts have nothing to delete; seeing them is what clears them
    try { await removeNotes(s.uid, items.flatMap((it) => it.notes.map((n) => n.id))); }
    catch (err) { console.error("Clear notifications failed", err); s.notify("Could not clear your notifications"); }
    finally { setBusy(false); }
  }

  function readOne(item: NoteItem) {
    const ids = item.notes.filter((n) => !n.read).map((n) => n.id);
    markRead(s.uid, ids).catch(() => s.notify("Could not mark it as read"));
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Notifications">
        <div className="sheet-head">
          <h2>Notifications</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body notes-body">
          {(items.length > 0 || alerts.length > 0) && (
            <div className="notes-tools">
              {(unreadIds.length > 0 || alerts.length > 0) && (
                <button type="button" className="btn small notes-readall" disabled={busy} onClick={markAll}>
                  <CheckIcon /> Mark all as read
                </button>
              )}
              <button type="button" className={`btn small notes-clear${armed ? " danger" : ""}`} disabled={busy} onClick={clearAll}>
                <TrashIcon /> {armed ? "Tap again to clear all" : "Clear all"}
              </button>
            </div>
          )}
          {loading && items.length === 0 && alerts.length === 0
            ? <RowsSkeleton />
            : items.length === 0 && alerts.length === 0
            ? <p className="hint notes-empty">You are all caught up. Requests, likes, comments and reposts show up here.</p>
            : (
              <ul className="notes">
                {alerts.map((a) => <GroupAlertRow key={a.gid} alert={a} onOpen={onOpenGroup} onRead={s.markGroupSeen} />)}
                {items.map((it) => <Row key={it.key} item={it} onOpen={onOpen} onRead={readOne} />)}
              </ul>
            )}
        </div>
      </div>
    </div>
  );
}

/** Bell in the top bar with a count of what you have not seen, opening the list of notifications. */
export default function NotificationBell() {
  const s = useSession();
  const { notes: all, ready: notesReady } = useNotesState(s.uid);
  const prefs = usePreferences();
  const [open, setOpen] = useState(false);

  // A friend request or group invite you have already answered is no longer news.
  const live = useMemo(() => all.filter((n) =>
    n.type === "friend_request" ? s.incoming.some((r) => r.from === n.actorUid)
      : n.type === "group_invite" ? prefs.groupInvites && s.invites.some((i) => i.groupId === n.groupId)
      : true), [all, s.incoming, s.invites, prefs.groupInvites]);
  const items = useNoteItems(live);
  const unreadIds = useMemo(() => live.filter((n) => !n.read).map((n) => n.id), [live]);
  const count = unreadIds.length + s.groupAlerts.length;

  function openedGroup(gid: string) {
    s.markGroupSeen(gid);
    setOpen(false);
  }

  function opened(item: NoteItem) {
    const ids = item.notes.filter((n) => !n.read).map((n) => n.id);
    if (ids.length) markRead(s.uid, ids).catch(() => {});
    setOpen(false);
  }

  return (
    <>
      <button type="button" className="icon-btn bell" onClick={() => setOpen(true)}
        aria-label={count > 0 ? `Notifications, ${count} new` : "Notifications"} aria-haspopup="dialog">
        <BellIcon />
        {count > 0 && <i className="badge bell-badge">{count > 99 ? "99+" : count}</i>}
      </button>
      {open && <NotificationsSheet items={items} loading={!notesReady} alerts={s.groupAlerts} unreadIds={unreadIds} onOpen={opened} onOpenGroup={openedGroup} onClose={() => setOpen(false)} />}
    </>
  );
}
