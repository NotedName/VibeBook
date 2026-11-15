import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ClipboardEvent, type KeyboardEvent,
} from "react";
import {
  failureReason, isUnread, markConversationSeen, MESSAGE_MAX, PAGE, SEARCH_WINDOW, sendMessage, useMessages, type Message, type Outgoing,
} from "../messages";
import { personHash } from "../profiles";
import { useProfile, useSession } from "../session";
import { chatPhoto } from "../image";
import { insertEmoji } from "../emoji";
import { useMessagingFrame } from "../msgFrame";
import type { Media } from "../stickers";
import type { Profile } from "../types";
import Avatar from "../Avatar";
import Highlight from "../Highlight";
import ChatInfoSheet from "../ChatInfoSheet";
import ImageViewer from "../ImageViewer";
import { enterSendsMessage } from "../preferences";
import MediaPicker from "../MediaPicker";
import {
  ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon, CloseIcon, ImageIcon, SearchIcon, SendIcon, SmileIcon,
} from "../icons";
import { LinesSkeleton } from "../Skeleton";

const GAP = 30 * 60_000; // a pause this long starts a new group, with its own time label
const MAX_PENDING = 6;   // pictures waiting to be sent

const dayOf = (ms: number) => new Date(ms).toDateString();
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** "3:45 PM" today, "Yesterday 3:45 PM", "Wed 3:45 PM" within a week, otherwise "Nov 3, 3:45 PM". */
function sepLabel(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  const days = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  const time = timeLabel(ms);
  if (days <= 0) return time;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7) return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
  const date = d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  });
  return `${date}, ${time}`;
}

/** One to three emoji and nothing else: shown large, without a bubble, as in Messenger. */
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D|\p{Emoji_Modifier})*){1,3}$/u;
const isBigEmoji = (text: string) => EMOJI_ONLY.test(text.replace(/\s+/g, ""));

/** By default on a phone the Enter key is a new line (the Send button sends); with a keyboard Enter sends and Shift+Enter is a new line. The chat's settings can change that. */
const enterSends = enterSendsMessage;

type BubblesProps = {
  messages: Message[]; loading: boolean; me: string; other: Profile | null | undefined; otherSeenAt: number;
  q: string; activeId: string; onPhoto: (src: string) => void;
};

/** Whether the device thinks it is online (a message waiting to send says "Waiting for connection" while it is not). */
function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
    () => navigator.onLine,
  );
}

function Bubbles({ messages, loading, me, other, otherSeenAt, q, activeId, onPhoto }: BubblesProps) {
  const [timeFor, setTimeFor] = useState("");
  const online = useOnline();
  // Only messages that arrive (or are sent) while the chat is open animate in; the ones loaded with it, and older ones, just appear.
  const known = useRef(new Set<string>());
  const animated = useRef(new Set<string>());
  const primed = useRef(false);
  const newest = useRef(0);
  useEffect(() => {
    if (loading) return;
    for (const m of messages) { known.current.add(m.id); newest.current = Math.max(newest.current, m.at); }
    primed.current = true;
  });
  const lastMine = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].from === me) return messages[i].id;
    return "";
  }, [messages, me]);

  return (
    <>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const mine = m.from === me;
        const sep = !prev || m.at - prev.at > GAP || dayOf(prev.at) !== dayOf(m.at);
        const nextSep = !!next && (next.at - m.at > GAP || dayOf(next.at) !== dayOf(m.at));
        const starts = !prev || sep || prev.from !== m.from;
        const ends = !next || nextSep || next.from !== m.from;
        const pos = starts && ends ? "solo" : starts ? "first" : ends ? "last" : "mid";
        const big = !m.image && !m.gif && isBigEmoji(m.text);
        const seen = otherSeenAt > 0 && otherSeenAt >= m.at;
        if (primed.current && !known.current.has(m.id) && m.at >= newest.current) animated.current.add(m.id);
        return (
          <div key={m.id} className={`msg ${mine ? "mine" : "theirs"} ${pos}${animated.current.has(m.id) ? " enter" : ""}${m.pending ? " pending" : ""}`} data-mid={m.id}>
            {sep && <p className="chat-sep">{sepLabel(m.at)}</p>}
            <div className="msg-row">
              {!mine && <span className="msg-av">{ends && <Avatar profile={other} size="sm" />}</span>}
              <div className="msg-col">
                {m.image && (
                  <button type="button" className="msg-photo" aria-label="Open photo" onClick={() => onPhoto(m.image)}>
                    <img src={m.image} alt="Photo" />
                  </button>
                )}
                {m.gif && <img className="msg-gif" src={m.gif} alt="GIF" referrerPolicy="no-referrer" />}
                {m.text !== "" && (
                  <div className={`bubble ${mine ? "mine" : "theirs"}${big ? " big" : ""}`} title={timeLabel(m.at)}
                    onClick={() => setTimeFor((t) => (t === m.id ? "" : m.id))}>
                    <Highlight text={m.text} q={q} current={m.id === activeId} />
                  </div>
                )}
                {timeFor === m.id && <time className="msg-time">{timeLabel(m.at)}</time>}
              </div>
            </div>
            {mine && m.id === lastMine && (
              <div className="msg-seen" key={m.pending ? "sending" : seen ? "seen" : "sent"}>
                {m.pending ? (online ? "Sending…" : "Waiting for connection…") : seen ? <><Avatar profile={other} size="sm" />Seen</> : "Sent"}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

type Pending = { id: number; url: string };

/** A message that could not be sent. It stays in the chat with Retry and Delete, so nothing you typed is lost. */
type Failed = { key: number; out: Outgoing; reason: string };
const outboxes = new Map<string, Failed[]>(); // per conversation, so leaving the chat and coming back keeps them
let failedSeq = 0;

function Composer({ onSend }: { onSend: (out: Outgoing) => void }) {
  const s = useSession();
  const [text, setText] = useState("");
  const [preparing, setPreparing] = useState(0);
  const [pending, setPending] = useState<Pending[]>([]);
  const [panel, setPanel] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const hasText = text.trim().length > 0;
  const ready = hasText || pending.length > 0;

  async function addFiles(list: File[]) {
    const pics = list.filter((f) => f.type.startsWith("image/"));
    if (!pics.length) return;
    const room = MAX_PENDING - pending.length - preparing;
    if (room <= 0) { s.notify(`You can add up to ${MAX_PENDING} photos at a time.`); return; }
    const take = pics.slice(0, room);
    if (pics.length > take.length) s.notify(`Only ${MAX_PENDING} photos fit at a time.`);
    setPreparing((n) => n + take.length);
    for (const file of take) {
      try {
        const url = await chatPhoto(file);
        setPending((p) => [...p, { id: nextId.current++, url }]);
      } catch {
        s.notify("That photo could not be added.");
      } finally {
        setPreparing((n) => n - 1);
      }
    }
  }

  // The message appears in the chat at once (as "Sending…") and the box is cleared; if it cannot be sent, ThreadPage keeps it as "Not sent".
  function send() {
    if (!ready || preparing > 0) return;
    const body = text;
    const pics = pending;
    setPending([]); setText(""); setPanel(false);
    for (const p of pics) onSend({ image: p.url });
    if (body.trim()) onSend({ text: body });
    box.current?.focus();
  }

  function pickMedia(media: Media) {
    setPanel(false);
    onSend(media.gif ? { gif: media.gif } : { text: media.sticker });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") setPanel(false);
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && enterSends()) { e.preventDefault(); send(); }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pics = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (pics.length) { e.preventDefault(); void addFiles(pics); }
  }

  return (
    <div className="chat-compose">
      {(pending.length > 0 || preparing > 0) && (
        <div className="chat-pending" aria-label="Photos to send">
          {pending.map((p) => (
            <div key={p.id} className="pending-thumb">
              <img src={p.url} alt="Photo to send" />
              <button type="button" aria-label="Remove photo" onClick={() => setPending((l) => l.filter((x) => x.id !== p.id))}><CloseIcon /></button>
            </div>
          ))}
          {Array.from({ length: preparing }, (_, i) => <div key={`p${i}`} className="pending-thumb loading" role="status" aria-label="Preparing photo" />)}
        </div>
      )}
      {panel && <MediaPicker onPick={pickMedia} onEmoji={(e) => insertEmoji(box.current, text, e, setText, MESSAGE_MAX)} />}
      <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <button type="button" className="icon-btn tool" aria-label="Add photos" title="Add photos" 
          onClick={() => files.current?.click()}><ImageIcon /></button>
        <button type="button" className={`icon-btn tool${panel ? " on" : ""}`} aria-label="Emoji, stickers and GIFs" title="Emoji, stickers and GIFs"
          aria-expanded={panel} onClick={() => setPanel((v) => !v)}><SmileIcon /></button>
        <textarea ref={box} rows={1} value={text} maxLength={MESSAGE_MAX} placeholder="Aa" aria-label="Message"
          onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onPaste={onPaste} />
        {ready
          ? <button key="send" type="submit" className="icon-btn send" aria-label="Send" disabled={preparing > 0}><SendIcon /></button>
          : <button key="like" type="button" className="icon-btn like" aria-label="Send a thumbs up" title="Send a thumbs up"
            onClick={() => onSend({ text: "👍" })}>👍</button>}
        <input ref={files} type="file" accept="image/*" multiple hidden
          onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </form>
    </div>
  );
}

/**
 * One conversation, laid out like Messenger: a header with the back button and the person, the messages in their own
 * scrolling area, and the message box at the bottom. Only friends can write.
 */
export default function ThreadPage({ uid: other }: { uid: string }) {
  const s = useSession();
  const p = useProfile(other);
  const frame = useRef<HTMLDivElement>(null);
  useMessagingFrame(frame);

  const [count, setCount] = useState(PAGE);
  const { messages, hasMore, loading, error } = useMessages(s.uid, other, count);
  const chat = s.chats.list.find((c) => c.other === other);
  const friend = s.friends.has(other);
  const unread = chat ? isUnread(chat, s.uid) : false;

  const body = useRef<HTMLDivElement>(null);
  const stick = useRef(true);   // true while the person is at the newest message
  const grow = useRef(0);       // height of the list before older messages were added, to keep the place
  const [showJump, setShowJump] = useState(false);
  const [viewer, setViewer] = useState("");
  const [finding, setFinding] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [q, setQ] = useState("");
  const [curId, setCurId] = useState("");
  const [failed, setFailed] = useState<Failed[]>(() => outboxes.get(other) ?? []);

  const changeFailed = useCallback((fn: (cur: Failed[]) => Failed[]) => setFailed((cur) => {
    const next = fn(cur);
    outboxes.set(other, next);
    return next;
  }), [other]);
  // Sending never blocks the box: the message shows up as "Sending…", and if the server turns it down it comes back here.
  const dispatch = useCallback((out: Outgoing) => {
    stick.current = true;
    sendMessage(s.uid, other, out).catch((err) => changeFailed((cur) => [...cur, { key: failedSeq++, out, reason: failureReason(err) }]));
  }, [s.uid, other, changeFailed]);
  const retry = (f: Failed) => { changeFailed((cur) => cur.filter((x) => x.key !== f.key)); dispatch(f.out); };
  const discard = (f: Failed) => changeFailed((cur) => cur.filter((x) => x.key !== f.key));

  // Opening a conversation, or getting a message while it is open, marks it read.
  useEffect(() => {
    if (unread) markConversationSeen(s.uid, other).catch(() => {});
  }, [unread, s.uid, other]);

  const toBottom = useCallback(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Stay at the newest message, unless the person has scrolled up to read older ones.
  const last = messages[messages.length - 1]?.id;
  useLayoutEffect(() => { if (stick.current) toBottom(); }, [last, loading, failed.length, toBottom]);

  // Older messages were added above: keep what the person was reading where it was.
  const first = messages[0]?.id;
  useLayoutEffect(() => {
    const el = body.current;
    if (el && grow.current) { el.scrollTop += el.scrollHeight - grow.current; grow.current = 0; }
  }, [first]);

  // Pictures loading in, or the message box growing, change the height: keep the newest message in view.
  useEffect(() => {
    const el = body.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (stick.current) toBottom(); });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [toBottom]);

  function loadEarlier() {
    const el = body.current;
    if (el) grow.current = el.scrollHeight;
    stick.current = false;
    setCount((n) => n + PAGE);
  }

  function onScroll() {
    const el = body.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = gap < 80;
    setShowJump(gap > 320);
    // reaching the top loads the next page (only once the last page has arrived)
    if (el.scrollTop < 80 && hasMore && !loading && messages.length >= count) loadEarlier();
  }

  // Search inside the conversation: the newest SEARCH_WINDOW messages are loaded, then matched as you type.
  const needle = q.trim().toLowerCase();
  const matches = useMemo(
    () => (needle ? messages.filter((m) => m.text.toLowerCase().includes(needle)).map((m) => m.id) : []),
    [messages, needle],
  );
  useEffect(() => setCurId(""), [needle]);
  const idx = matches.indexOf(curId);
  const active = matches.length ? (idx >= 0 ? idx : matches.length - 1) : -1; // newest match first
  const activeId = active >= 0 ? matches[active] : "";
  useEffect(() => {
    if (!finding || !activeId) return;
    stick.current = false;
    body.current?.querySelector(`[data-mid="${activeId}"]`)?.scrollIntoView({ block: "center" });
  }, [finding, activeId]);

  function openSearch() {
    setFinding(true);
    setCount((n) => Math.max(n, SEARCH_WINDOW));
  }
  function closeSearch() { setFinding(false); setQ(""); }

  if (p === null) {
    return (
      <div className="empty">
        <h2>Person not found</h2>
        <p>This person may not have set up VibeBook yet.</p>
        <a className="btn" href="#/messages">Back to messages</a>
      </div>
    );
  }

  const name = p === undefined ? "…" : p.displayName || "VibeBook member";

  return (
    <div className="chat" ref={frame}>
      {finding ? (
        <header className="chat-bar">
          <button type="button" className="chat-back" onClick={closeSearch} aria-label="Close search"><ArrowLeftIcon /></button>
          <div className="search chat-find">
            <SearchIcon />
            <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search in conversation" aria-label="Search in this conversation" />
          </div>
          {needle && <span className="chat-find-count" aria-live="polite">{matches.length ? `${active + 1} of ${matches.length}` : "No results"}</span>}
          <button type="button" className="icon-btn" aria-label="Previous (older) match" disabled={active <= 0}
            onClick={() => setCurId(matches[active - 1])}><ChevronUpIcon /></button>
          <button type="button" className="icon-btn" aria-label="Next (newer) match" disabled={active < 0 || active >= matches.length - 1}
            onClick={() => setCurId(matches[active + 1])}><ChevronDownIcon /></button>
          <button type="button" className="icon-btn" aria-label="Close search" title="Close search" onClick={closeSearch}><CloseIcon /></button>
        </header>
      ) : (
        <header className="chat-bar">
          <a className="chat-back" href="#/messages" aria-label="Back to messages"><ArrowLeftIcon /></a>
          <button type="button" className="chat-who" aria-haspopup="dialog" aria-label={`${name}, chat info`} onClick={() => setInfoOpen(true)}>
            <Avatar profile={p} size="md" />
            <span className="chat-who-text">
              <b>{name}</b>
              {p?.username && <span>@{p.username}</span>}
            </span>
          </button>
          <button type="button" className="icon-btn" aria-label="Search in conversation" title="Search in conversation" onClick={openSearch}><SearchIcon /></button>
        </header>
      )}
      {finding && hasMore && (
        <p className="chat-find-note">
          Searching your latest {messages.length} messages.{" "}
          <button type="button" className="link-act" onClick={() => setCount((n) => n + SEARCH_WINDOW)}>Search older messages</button>
        </p>
      )}

      <div className="chat-main">
        <div className="chat-body" ref={body} onScroll={onScroll} aria-live="polite">
          <div className="chat-stream">
            {error && <p className="error note" role="alert">{error}</p>}
            {loading && <LinesSkeleton label="Loading messages" />}
            {hasMore && !loading && (
              <button type="button" className="btn small chat-more" onClick={loadEarlier}>Load earlier messages</button>
            )}
            {!hasMore && !loading && !error && (
              <div className="chat-intro">
                <Avatar profile={p} size="lg" />
                <b>{name}</b>
                {p?.username && <span>@{p.username}</span>}
                <a className="btn small" href={personHash(other, p)}>View profile</a>
                {messages.length === 0 && <p className="hint">No messages yet. Say hello.</p>}
              </div>
            )}
            <Bubbles messages={messages} loading={loading} me={s.uid} other={p} otherSeenAt={chat?.otherSeenAt ?? 0}
              q={finding ? q : ""} activeId={finding ? activeId : ""} onPhoto={setViewer} />
            {failed.map((f) => (
              <div key={f.key} className="msg mine solo failed" role="group" aria-label="Message not sent">
                <div className="msg-row">
                  <div className="msg-col">
                    {f.out.image && <img className="msg-gif" src={f.out.image} alt="Photo not sent" />}
                    {f.out.gif && <img className="msg-gif" src={f.out.gif} alt="GIF not sent" referrerPolicy="no-referrer" />}
                    {f.out.text && <div className="bubble mine">{f.out.text}</div>}
                  </div>
                </div>
                <div className="msg-failed" role="alert">
                  <span>Not sent. {f.reason}</span>
                  <button type="button" className="link-act" onClick={() => retry(f)}>Retry</button>
                  <button type="button" className="link-act" onClick={() => discard(f)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {showJump && (
          <button type="button" className="chat-jump" aria-label="Jump to the newest message"
            onClick={() => { stick.current = true; toBottom(); }}><ChevronDownIcon /></button>
        )}
      </div>

      {friend
        ? <Composer onSend={dispatch} />
        : <p className="hint chat-locked">You can only message people who are your friends.</p>}
      {infoOpen && (
        <ChatInfoSheet uid={other} profile={p} friend={friend} onClose={() => setInfoOpen(false)}
          onSearch={() => { setInfoOpen(false); openSearch(); }} />
      )}
      {viewer && <ImageViewer src={viewer} label="Photo" onClose={() => setViewer("")} />}
    </div>
  );
}
