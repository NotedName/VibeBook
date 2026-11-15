import { useSession } from "../session";
import ChatRow from "../ChatRow";
import { RowsSkeleton } from "../Skeleton";
import { ArchiveIcon } from "../icons";

/** Opened from Account > Archived chats: conversations you tucked away. A new message from them brings a chat back to your messages. */
export default function ArchivedChatsPage() {
  const s = useSession();
  const { archived, ready, error } = s.chats;
  return (
    <div className="feed">
      <div className="title-row">
        <h1 className="page-title">Archived chats</h1>
      </div>
      <p className="hint archived-note"><ArchiveIcon />Hidden from your messages until you unarchive them. A new message from them brings a chat back.</p>
      {error && <p className="error note" role="alert">{error}</p>}
      {!ready && <section className="people-section"><RowsSkeleton /></section>}
      {ready && archived.length > 0 && (
        <section className="people-section">
          <ul className="people chat-list">{archived.map((c) => <ChatRow key={c.id} chat={c} uid={s.uid} />)}</ul>
        </section>
      )}
      {ready && !error && archived.length === 0 && (
        <div className="empty">
          <h2>No archived chats</h2>
          <p>Open the ☰ menu on a chat and choose Archive chat to tuck it away here without deleting it.</p>
          <a className="btn primary" href="#/messages">Back to messages</a>
        </div>
      )}
    </div>
  );
}
