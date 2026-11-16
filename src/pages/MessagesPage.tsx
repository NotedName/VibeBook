import { useEffect, useMemo, useState, type FormEvent } from "react";
import E2eePrompt from "../E2eePrompt";
import { isUnread } from "../messages";
import { activeNoteText, fetchProfile, NOTE_MAX, setProfileNote } from "../profiles";
import { useProfile, useSession } from "../session";
import { usePresence } from "../activeStatus";
import { INVITE_LIST_LIMIT, type Profile } from "../types";
import { useMessagingFrame } from "../msgFrame";
import Avatar from "../Avatar";
import ChatRow, { nameOf, threadHash } from "../ChatRow";
import Highlight from "../Highlight";
import { ChevronRightIcon, CloseIcon, MailIcon, SearchIcon } from "../icons";
import { RowsSkeleton } from "../Skeleton";
import { useScrollLock } from "../scrollLock";

/** Profiles of these people as they load (each is fetched once and cached), so the list can be searched by name. */
function useProfileMap(ids: string[]) {
  const [map, setMap] = useState<Map<string, Profile | null>>(new Map());
  const key = ids.join(",");
  useEffect(() => {
    let live = true;
    ids.forEach((id) => {
      fetchProfile(id).then(
        (p) => { if (live) setMap((m) => (m.has(id) ? m : new Map(m).set(id, p))); },
        () => { if (live) setMap((m) => (m.has(id) ? m : new Map(m).set(id, null))); },
      );
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}

function ActiveTrayItem({ uid }: { uid: string }) {
  const p = useProfile(uid);
  const presence = usePresence(uid);
  const note = activeNoteText(p);
  const isActive = presence.status === "active";
  if (!isActive && !note) return null;
  const firstName = (p?.displayName || "Member").split(/\s+/)[0];
  return (
    <a className="msg-tray-item" href={threadHash(uid)} title={note || `${nameOf(p)} · Active now`}>
      {note && <span className="msg-note-pill">{note}</span>}
      <Avatar profile={p} size="lg" active={isActive} />
      <span className="msg-tray-name">{firstName}</span>
    </a>
  );
}

function NoteComposerSheet({ initial, onClose }: { initial: string; onClose: () => void }) {
  const { uid, notify } = useSession();
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  useScrollLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await setProfileNote(uid, draft);
      notify(draft.trim() ? "24-hour note shared" : "Note cleared");
      onClose();
    } catch {
      notify("Could not update your note. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="Share a 24-hour note" onSubmit={submit}>
        <div className="sheet-head">
          <h2>Share a thought</h2>
          <button type="button" className="icon-btn close" aria-label="Close" disabled={busy} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <p className="hint">Visible at the top of Messages and on your profile for 24 hours.</p>
          <label>
            Note
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={NOTE_MAX}
              placeholder="Drop a thought..."
              autoFocus
            />
            <small className="count">{draft.length}/{NOTE_MAX}</small>
          </label>
        </div>
        <div className="sheet-actions">
          {initial && (
            <button
              type="button"
              className="btn danger-ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await setProfileNote(uid, "");
                  notify("Note cleared");
                  onClose();
                } catch {
                  notify("Could not clear your note.");
                  setBusy(false);
                }
              }}
            >
              Clear note
            </button>
          )}
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Share"}</button>
        </div>
      </form>
    </div>
  );
}

function StartRow({ uid, q }: { uid: string; q: string }) {
  const p = useProfile(uid);
  const presence = usePresence(uid);
  return (
    <li>
      <a className="chat-row" href={threadHash(uid)}>
        <Avatar profile={p} size="md" active={presence.status === "active"} />
        <span className="chat-row-text">
          <b><Highlight text={nameOf(p)} q={q} /></b>
          {presence.status === "active"
            ? <span className="chat-active-now">Active now</span>
            : p?.username ? <span>@<Highlight text={p.username} q={q} /></span> : null}
        </span>
      </a>
    </li>
  );
}

/**
 * Your conversations, newest first, and friends you have not written to yet. The list scrolls inside its own frame under a
 * search box that finds chats and friends by name, @username or the last message.
 */
export default function MessagesPage() {
  const s = useSession();
  useMessagingFrame();
  const { list, ready, error } = s.chats;
  const [text, setText] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const q = text.trim();
  const needle = q.toLowerCase();
  const tokens = needle.split(/\s+/).filter(Boolean);

  const talking = useMemo(() => new Set([...list, ...s.chats.archived].map((c) => c.other)), [list, s.chats.archived]);
  const starters = [...s.friends].filter((id) => !talking.has(id));
  const ids = useMemo(() => [...new Set([...list.map((c) => c.other), ...s.friends])], [list, s.friends]);
  const profiles = useProfileMap(needle ? ids : []);
  const unreadCount = list.filter((c) => isUnread(c, s.uid) && !c.blocked).length;

  const myNote = activeNoteText(s.me);
  const trayIds = useMemo(() => [...new Set([...s.friends, ...list.filter((c) => !c.blocked).map((c) => c.other)])], [s.friends, list]);

  const nameHit = (id: string) => {
    const p = profiles.get(id);
    if (!p) return false;
    const hay = `${p.displayName} @${p.username}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  };
  const chats = list.filter((c) =>
    (!onlyUnread || (isUnread(c, s.uid) && !c.blocked)) && (!needle || nameHit(c.other) || c.lastText.toLowerCase().includes(needle)));
  const friends = onlyUnread ? [] : needle ? starters.filter(nameHit) : starters.slice(0, INVITE_LIST_LIMIT);
  const nothingFound = !!needle && chats.length === 0 && friends.length === 0 && ids.every((id) => profiles.has(id));

  return (
    <div className="inbox">
      <div className="inbox-head">
        <div className="title-row">
          <h1 className="page-title">Messages</h1>
        </div>
        <div className="search">
          <SearchIcon />
          <input type="search" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Search chats and friends" aria-label="Search your chats and friends" />
        </div>

        {/* Messenger-style Active Status & 24-hour Notes Tray */}
        {!needle && s.me && (
          <div className="msg-tray" role="region" aria-label="Active friends and 24-hour notes">
            <button type="button" className="msg-tray-item self" onClick={() => setNoteOpen(true)}>
              <span className={`msg-note-pill${myNote ? " has-note" : ""}`}>{myNote || "Drop a thought."}</span>
              <span className="msg-tray-av">
                <Avatar profile={s.me} size="lg" />
                <span className="msg-note-plus" aria-hidden="true">+</span>
              </span>
              <span className="msg-tray-name">Your note</span>
            </button>
            {trayIds.map((uid) => <ActiveTrayItem key={uid} uid={uid} />)}
          </div>
        )}

        <div className="inbox-chips" role="group" aria-label="Filter chats">
          <button type="button" className={`chip-btn${onlyUnread ? "" : " on"}`} aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)}>All</button>
          <button type="button" className={`chip-btn${onlyUnread ? " on" : ""}`} aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)}>
            Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
        </div>
      </div>

      <div className="inbox-scroll">
        <E2eePrompt />
        {s.chats.requests.length > 0 && !needle && (
          <section className="people-section">
            <ul className="people chat-list">
              <li><a className="chat-row request-link" href="#/message-requests">
                <i className="request-ico"><MailIcon /></i>
                <span className="chat-row-text"><b>Message requests</b><span>From people who are not your friends, and people you restricted</span></span>
                <span className="chat-row-meta"><span className="badge-count">{s.chats.requests.length}</span></span>
                <ChevronRightIcon />
              </a></li>
            </ul>
          </section>
        )}
        {error && <p className="error note" role="alert">{error}</p>}
        {!ready && <section className="people-section"><RowsSkeleton /></section>}
        {ready && chats.length > 0 && (
          <section className="people-section">
            {needle && <h2>Chats <span>{chats.length}</span></h2>}
            <ul className="people chat-list">{chats.map((c) => <ChatRow key={c.id} chat={c} uid={s.uid} q={q} />)}</ul>
          </section>
        )}
        {ready && friends.length > 0 && (
          <section className="people-section">
            <h2>{needle ? "Friends" : "Start a chat"}</h2>
            <ul className="people chat-list">{friends.map((id) => <StartRow key={id} uid={id} q={q} />)}</ul>
          </section>
        )}
        {ready && !error && onlyUnread && !needle && chats.length === 0 && <p className="note">You have no unread chats.</p>}
        {ready && nothingFound && (
          <p className="note">No chats or friends match “{q}”. Not friends yet? <a href="#/people">Find people</a></p>
        )}
        {ready && !error && !onlyUnread && !needle && list.length === 0 && starters.length === 0 && (
          <div className="empty">
            <h2>No messages yet</h2>
            <p>You can message your friends. Add a friend, then start a chat from their profile.</p>
            <a className="btn primary" href="#/people">Find people</a>
          </div>
        )}
      </div>

      {noteOpen && <NoteComposerSheet initial={myNote} onClose={() => setNoteOpen(false)} />}
    </div>
  );
}
