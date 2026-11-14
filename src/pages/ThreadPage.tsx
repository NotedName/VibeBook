import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { isUnread, markConversationSeen, MESSAGE_MAX, PAGE, sendMessage, useMessages, type Message } from "../messages";
import { personHash } from "../profiles";
import { useProfile, useSession } from "../session";
import Avatar from "../Avatar";
import { SendIcon } from "../icons";
import { LinesSkeleton } from "../Skeleton";

const dayOf = (ms: number) => new Date(ms).toDateString();
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
/** On a phone the Enter key is a new line (the Send button sends); with a keyboard Enter sends and Shift+Enter is a new line. */
const enterSends = () => !window.matchMedia("(pointer: coarse)").matches;
const nearBottom = () => document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 120;

function Bubbles({ messages, me }: { messages: Message[]; me: string }) {
  return (
    <>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const newDay = !prev || dayOf(prev.at) !== dayOf(m.at);
        const endsRun = !next || next.from !== m.from || dayOf(next.at) !== dayOf(m.at) || next.at - m.at > 5 * 60_000;
        return (
          <div key={m.id} className="chat-item">
            {newDay && <p className="chat-day">{dayLabel(m.at)}</p>}
            <div className={`bubble ${m.from === me ? "mine" : "theirs"}`}>{m.text}</div>
            {endsRun && <time className={`bubble-time ${m.from === me ? "mine" : "theirs"}`}>{timeLabel(m.at)}</time>}
          </div>
        );
      })}
    </>
  );
}

function Composer({ me, other, onSend }: { me: string; other: string; onSend: () => void }) {
  const s = useSession();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const ready = text.trim().length > 0;

  async function send() {
    if (!ready || busy) return;
    setBusy(true);
    onSend();
    try {
      await sendMessage(me, other, text);
      setText("");
      box.current?.focus();
    } catch {
      s.notify("That did not send. Try again.");
    } finally { setBusy(false); }
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && enterSends()) { e.preventDefault(); send(); }
  }

  return (
    <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <textarea ref={box} rows={1} value={text} maxLength={MESSAGE_MAX} placeholder="Write a message…" aria-label="Message"
        onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
      <button type="submit" className="icon-btn send" aria-label="Send" disabled={!ready || busy}><SendIcon /></button>
    </form>
  );
}

/** One conversation: messages oldest to newest, and a box to write in. Only friends can write. */
export default function ThreadPage({ uid: other }: { uid: string }) {
  const s = useSession();
  const p = useProfile(other);
  const [count, setCount] = useState(PAGE);
  const { messages, hasMore, loading, error } = useMessages(s.uid, other, count);
  const chat = s.chats.list.find((c) => c.other === other);
  const friend = s.friends.has(other);
  const stick = useRef(true);
  const unread = chat ? isUnread(chat, s.uid) : false;

  // Opening a conversation, or getting a message while it is open, marks it read.
  useEffect(() => {
    if (unread) markConversationSeen(s.uid, other).catch(() => {});
  }, [unread, s.uid, other]);

  useEffect(() => {
    const onScroll = () => { stick.current = nearBottom(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Stay at the newest message, unless the person has scrolled up to read older ones.
  const last = messages[messages.length - 1]?.id;
  useLayoutEffect(() => {
    if (stick.current) window.scrollTo(0, document.documentElement.scrollHeight);
  }, [last]);

  if (p === null) {
    return (
      <div className="empty">
        <h2>Person not found</h2>
        <p>This person may not have set up VibeBook yet.</p>
        <a className="btn" href="#/messages">Back to messages</a>
      </div>
    );
  }

  return (
    <div className="chat">
      <a className="chat-head" href={personHash(other, p)}>
        <Avatar profile={p} size="md" />
        <span className="chat-head-text">
          <b>{p === undefined ? "…" : p.displayName || "VibeBook member"}</b>
          {p?.username && <span>@{p.username}</span>}
        </span>
      </a>
      <div className="chat-body" aria-live="polite">
        {error && <p className="error note" role="alert">{error}</p>}
        {loading && <LinesSkeleton label="Loading messages" />}
        {hasMore && (
          <button type="button" className="btn small chat-more"
            onClick={() => { stick.current = false; setCount((n) => n + PAGE); }}>Load earlier messages</button>
        )}
        {!loading && !error && messages.length === 0 && <p className="hint chat-empty">No messages yet. Say hello.</p>}
        <Bubbles messages={messages} me={s.uid} />
      </div>
      {friend
        ? <Composer me={s.uid} other={other} onSend={() => { stick.current = true; }} />
        : <p className="hint chat-locked">You can only message people who are your friends.</p>}
    </div>
  );
}
