import { useEffect, useMemo, useState } from "react";
import { isUnread } from "../messages";
import { fetchProfile } from "../profiles";
import { useProfile, useSession } from "../session";
import { INVITE_LIST_LIMIT, type Profile } from "../types";
import { useMessagingFrame } from "../msgFrame";
import Avatar from "../Avatar";
import ChatRow, { nameOf, threadHash } from "../ChatRow";
import Highlight from "../Highlight";
import { SearchIcon } from "../icons";
import { RowsSkeleton } from "../Skeleton";

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

function StartRow({ uid, q }: { uid: string; q: string }) {
  const p = useProfile(uid);
  return (
    <li>
      <a className="chat-row" href={threadHash(uid)}>
        <Avatar profile={p} size="md" />
        <span className="chat-row-text">
          <b><Highlight text={nameOf(p)} q={q} /></b>
          {p?.username && <span>@<Highlight text={p.username} q={q} /></span>}
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
  const q = text.trim();
  const needle = q.toLowerCase();
  const tokens = needle.split(/\s+/).filter(Boolean);

  const talking = useMemo(() => new Set([...list, ...s.chats.archived].map((c) => c.other)), [list, s.chats.archived]);
  const starters = [...s.friends].filter((id) => !talking.has(id));
  const ids = useMemo(() => [...new Set([...list.map((c) => c.other), ...s.friends])], [list, s.friends]);
  const profiles = useProfileMap(needle ? ids : []);
  const unreadCount = list.filter((c) => isUnread(c, s.uid) && !c.blocked).length;

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
        <div className="inbox-chips" role="group" aria-label="Filter chats">
          <button type="button" className={`chip-btn${onlyUnread ? "" : " on"}`} aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)}>All</button>
          <button type="button" className={`chip-btn${onlyUnread ? " on" : ""}`} aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)}>
            Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </button>
        </div>
      </div>

      <div className="inbox-scroll">
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
    </div>
  );
}
