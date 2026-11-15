import { useSession } from "../session";
import ChatRow from "../ChatRow";
import { RowsSkeleton } from "../Skeleton";
import { MailIcon } from "../icons";

/** Opened from the top of Messages: first messages from people who are not your friends. Nothing is shown as read to them until you accept. */
export default function MessageRequestsPage() {
  const s = useSession();
  const { requests, ready, error } = s.chats;
  return (
    <div className="feed">
      <div className="title-row">
        <h1 className="page-title">Message requests</h1>
      </div>
      <p className="hint archived-note"><MailIcon />People who are not your friends can send one message. Open it to accept or delete it. They are not told that you have read it. Chats with people you restricted are here too.</p>
      {error && <p className="error note" role="alert">{error}</p>}
      {!ready && <section className="people-section"><RowsSkeleton /></section>}
      {ready && requests.length > 0 && (
        <section className="people-section">
          <ul className="people chat-list">{requests.map((c) => <ChatRow key={c.id} chat={c} uid={s.uid} />)}</ul>
        </section>
      )}
      {ready && !error && requests.length === 0 && (
        <div className="empty">
          <h2>No message requests</h2>
          <p>When someone who is not your friend messages you, it shows up here instead of in your chats.</p>
          <a className="btn primary" href="#/messages">Back to messages</a>
        </div>
      )}
    </div>
  );
}
