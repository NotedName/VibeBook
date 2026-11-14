import { isUnread, type Conversation } from "../messages";
import { ago } from "../notifications";
import { useProfile, useSession } from "../session";
import { INVITE_LIST_LIMIT } from "../types";
import Avatar from "../Avatar";
import { RowsSkeleton } from "../Skeleton";

const threadHash = (uid: string) => `#/m/${encodeURIComponent(uid)}`;
const nameOf = (p: { displayName: string } | null | undefined) => (p === undefined ? "…" : p?.displayName || "VibeBook member");

function ChatRow({ chat, uid }: { chat: Conversation; uid: string }) {
  const p = useProfile(chat.other);
  const unread = isUnread(chat, uid);
  return (
    <li>
      <a className={`chat-row${unread ? " unread" : ""}`} href={threadHash(chat.other)}>
        <Avatar profile={p} size="md" />
        <span className="chat-row-text">
          <b>{nameOf(p)}</b>
          <span>{chat.lastFrom === uid ? "You: " : ""}{chat.lastText}</span>
        </span>
        <span className="chat-row-meta">
          <time>{ago(chat.updatedAt)}</time>
          {unread && <i className="chat-dot" role="img" aria-label="Unread" />}
        </span>
      </a>
    </li>
  );
}

function StartRow({ uid }: { uid: string }) {
  const p = useProfile(uid);
  return (
    <li>
      <a className="chat-row" href={threadHash(uid)}>
        <Avatar profile={p} size="md" />
        <span className="chat-row-text"><b>{nameOf(p)}</b>{p?.username && <span>@{p.username}</span>}</span>
      </a>
    </li>
  );
}

/** Your conversations, newest first, and friends you have not written to yet. */
export default function MessagesPage() {
  const s = useSession();
  const { list, ready, error } = s.chats;
  const talking = new Set(list.map((c) => c.other));
  const starters = [...s.friends].filter((id) => !talking.has(id)).slice(0, INVITE_LIST_LIMIT);
  return (
    <div className="people-page">
      <h1 className="page-title">Messages</h1>
      {error && <p className="error note" role="alert">{error}</p>}
      {!ready && <section className="people-section"><RowsSkeleton /></section>}
      {ready && list.length > 0 && (
        <section className="people-section">
          <ul className="people chat-list">{list.map((c) => <ChatRow key={c.id} chat={c} uid={s.uid} />)}</ul>
        </section>
      )}
      {ready && starters.length > 0 && (
        <section className="people-section">
          <h2>Start a chat</h2>
          <ul className="people chat-list">{starters.map((id) => <StartRow key={id} uid={id} />)}</ul>
        </section>
      )}
      {ready && !error && list.length === 0 && starters.length === 0 && (
        <div className="empty">
          <h2>No messages yet</h2>
          <p>You can message your friends. Add a friend, then start a chat from their profile.</p>
          <a className="btn primary" href="#/people">Find people</a>
        </div>
      )}
    </div>
  );
}
