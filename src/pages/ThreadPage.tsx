import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ClipboardEvent, type KeyboardEvent, type TouchEvent,
} from "react";
import {
  acceptChat, blockPerson, calledBy, deleteChatForMe, editMessage, failureReason, isUnread, markRead, MESSAGE_MAX, PAGE, PIN_MAX, pinMessage,
  replyRefOf, SEARCH_WINDOW, sendMessage, setReaction, snippetOf, unblockPerson, unpinMessage, unrestrictPerson, unsendMessage, useBlockedBy, useChatExtras, useChatSettings, useMessages,
  type Message, type Notice, type Outgoing, type Reaction,
} from "../messages";
import { RateLimitError } from "../rateLimit";
import { copyText } from "../report";
import ConfirmDialog from "../ConfirmDialog";
import { ForwardSheet, MessageActions, ReactionChips, ReplyQuote, ReportMessageSheet } from "../MessageTools";
import { personHash } from "../profiles";
import { themeStyle } from "../chatThemes";
import { useProfile, useSession } from "../session";
import { usePresence } from "../activeStatus";
import { chatPhoto } from "../image";
import { insertEmoji } from "../emoji";
import { NetworkUnavailable } from "../network";
import SharedEntryCard from "../SharedEntryCard";
import { parseSharedEntry } from "../shareEntry";
import { DEFAULT_QUICK_EMOJI, usePreferences } from "../preferences";
import { useMessagingFrame } from "../msgFrame";
import type { Media } from "../stickers";
import type { Profile } from "../types";
import Avatar from "../Avatar";
import Highlight from "../Highlight";
import { Linkified } from "../links";
import CameraSheet from "../CameraSheet";
import ChatInfoSheet from "../ChatInfoSheet";
import E2eePrompt from "../E2eePrompt";
import { useE2ee } from "../e2ee";
import ImageViewer from "../ImageViewer";
import { enterSendsMessage } from "../preferences";
import { DropHint, useImageDrop } from "../imageDrop";
import MediaPicker from "../MediaPicker";
import {
  AlertIcon, ArrowLeftIcon, CameraIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, CloseIcon, ForwardIcon, ImageIcon, InfoIcon, MoreIcon, PinIcon, ReplyIcon, SearchIcon, SendIcon,
  SmileIcon,
} from "../icons";
import { LoadingImg, MessagesSkeleton, NameSkeleton } from "../Skeleton";

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
  /** people's names as this chat calls them (nicknames included) */
  nameOf: (uid: string) => string;
  /** the other person's own name, for the lines about changes to the chat */
  realName: string;
  reactions: Map<string, Reaction[]>; pinned: Set<string>; flash: string;
  /** false when nothing can be written (a request, a block, locked keys): no menu, no reacting */
  canAct: boolean;
  onMenu: (m: Message) => void; onReact: (m: Message, emoji: string) => void; onJump: (id: string) => void;
  /** the quick reply button beside the menu, and the quick reaction (this device's emoji) */
  onReply: (m: Message) => void; quickEmoji: string;
};

/**
 * The line the chat shows when something about it changes. Names are the people's real ones (a nickname line that used the nickname
 * would read "Bo set their own nickname to Bo"). A pin links to the pinned message.
 */
function NoticeLine({ m, notice, me, realName, onJump }: { m: Message; notice: Notice; me: string; realName: string; onJump: (id: string) => void }) {
  const actor = m.from === me ? "You" : realName;
  if (notice.k === "emoji") return <>{actor} changed the chat emoji to <span className="chat-notice-emoji">{notice.emoji}</span></>;
  if (notice.k === "nick") {
    // whose nickname: yours, theirs, or (when the person changed their own) "your own" / "their own"
    const whose = notice.who === m.from ? (m.from === me ? "your own" : "their own") : notice.who === me ? "your" : `${realName}'s`;
    return notice.nick ? <>{actor} set {whose} nickname to <b>{notice.nick}</b></> : <>{actor} removed {whose} nickname</>;
  }
  return (
    <><PinIcon />{actor} {notice.k === "pin" ? "pinned" : "unpinned"}{" "}
      <button type="button" className="link-act" onClick={() => onJump(notice.mid)}>a message</button></>
  );
}

/** Whether the device thinks it is online (a message waiting to send says "Waiting for connection" while it is not). */
function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
    () => navigator.onLine,
  );
}

function Bubbles({ messages, loading, me, other, otherSeenAt, q, activeId, onPhoto, nameOf, realName, reactions, pinned, flash, canAct, onMenu, onReact, onJump, onReply, quickEmoji }: BubblesProps) {
  const [timeFor, setTimeFor] = useState("");
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  // Long press (touch) opens the message menu; a right click or the ... button does the same on a computer.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const endPress = () => { if (press.current) { clearTimeout(press.current.timer); press.current = null; } };
  useEffect(() => endPress, []);
  const startPress = (e: TouchEvent<HTMLElement>, m: Message) => {
    if (!canAct || m.unsent || m.pending) return;
    endPress();
    const t = e.touches[0];
    press.current = { x: t.clientX, y: t.clientY, timer: window.setTimeout(() => { press.current = null; navigator.vibrate?.(12); onMenu(m); }, 450) };
  };
  const movePress = (e: TouchEvent<HTMLElement>) => {
    const p = press.current;
    if (p && Math.hypot(e.touches[0].clientX - p.x, e.touches[0].clientY - p.y) > 10) endPress();
  };
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
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].from === me && !messages[i].sys) return messages[i].id;
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
        // a line about the chat (a pin, a new emoji) splits a run of messages from the same person
        const starts = !prev || sep || prev.from !== m.from || !!prev.sys;
        const ends = !next || nextSep || next.from !== m.from || !!next.sys;
        const pos = starts && ends ? "solo" : starts ? "first" : ends ? "last" : "mid";
        const big = !m.image && !m.gif && isBigEmoji(m.text);
        const shared = !m.image && !m.gif && !m.unsent ? parseSharedEntry(m.text) : null;
        const seen = otherSeenAt > 0 && otherSeenAt >= m.at;
        if (primed.current && !known.current.has(m.id) && m.at >= newest.current) animated.current.add(m.id);
        if (m.sys) {
          return (
            <div key={m.id} className={`msg sys${animated.current.has(m.id) ? " enter" : ""}${m.pending ? " pending" : ""}`} data-mid={m.id}>
              {sep && <p className="chat-sep">{sepLabel(m.at)}</p>}
              <p className="chat-notice"><NoticeLine m={m} notice={m.sys} me={me} realName={realName} onJump={onJump} /></p>
            </div>
          );
        }
        return (
          <div key={m.id} className={`msg ${mine ? "mine" : "theirs"} ${pos}${animated.current.has(m.id) ? " enter" : ""}${m.pending ? " pending" : ""}${flash === m.id ? " flash" : ""}`} data-mid={m.id}>
            {sep && <p className="chat-sep">{sepLabel(m.at)}</p>}
            <div className="msg-row">
              {!mine && <span className="msg-av">{ends && <Avatar profile={other} size="sm" />}</span>}
              <div className="msg-col"
                onTouchStart={(e) => startPress(e, m)} onTouchMove={movePress} onTouchEnd={endPress} onTouchCancel={endPress}
                onContextMenu={(e) => { if (canAct && !m.unsent && !m.pending) { e.preventDefault(); onMenu(m); } }}>
                {m.unsent ? (
                  <div className={`bubble unsent ${mine ? "mine" : "theirs"}`}>{mine ? "You unsent a message" : `${nameOf(m.from)} unsent a message`}</div>
                ) : <>
                {m.fwd && <span className="msg-fwd"><ForwardIcon />Forwarded</span>}
                {m.reply && (
                  <ReplyQuote reply={m.reply} mine={mine} original={byId.get(m.reply.id)} onJump={onJump}
                    who={m.reply.from === me ? "You" : nameOf(m.reply.from)} />
                )}
                {m.image && (
                  <button type="button" className="msg-photo" aria-label="Open photo" onClick={() => onPhoto(m.image)}>
                    <img src={m.image} alt="Photo" />
                  </button>
                )}
                {m.gif && <LoadingImg className="msg-gif" src={m.gif} alt="GIF" referrerPolicy="no-referrer" />}
                {shared && <SharedEntryCard uid={shared.uid} id={shared.id} title={shared.title} />}
                {m.text !== "" && !(shared && !shared.note) && (
                  <div className={`bubble ${mine ? "mine" : "theirs"}${big ? " big" : ""}`} title={timeLabel(m.at)}
                    onClick={() => setTimeFor((t) => (t === m.id ? "" : m.id))}>
                    {q.trim() ? <Highlight text={m.text} q={q} current={m.id === activeId} /> : <Linkified text={shared ? shared.note : m.text} />}
                  </div>
                )}
                <ReactionChips list={reactions.get(m.id) ?? []} me={me} onToggle={(emoji) => canAct && onReact(m, emoji)} />
                {(m.edited || pinned.has(m.id)) && (
                  <span className="msg-flags">{pinned.has(m.id) && <span><PinIcon />Pinned</span>}{m.edited && <span>Edited</span>}</span>
                )}
                {timeFor === m.id && <time className="msg-time">{timeLabel(m.at)}</time>}
                </>}
              </div>
              {canAct && !m.unsent && !m.pending && (
                <div className="msg-tools">
                  <button type="button" className="icon-btn quick-react" aria-label={`React with ${quickEmoji}`} title={`React with ${quickEmoji}`}
                    onClick={() => onReact(m, quickEmoji)}>{quickEmoji}</button>
                  <button type="button" className="icon-btn" aria-label="Reply" title="Reply" onClick={() => onReply(m)}><ReplyIcon /></button>
                  <button type="button" className="icon-btn" aria-label="Message actions: react, reply, forward, pin and more" title="React, reply and more" onClick={() => onMenu(m)}><MoreIcon /></button>
                </div>
              )}
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

/** `emoji` is what the button next to the box sends (a thumbs up unless you and your friend picked another one in the chat info). */
type ComposerProps = {
  onSend: (out: Outgoing) => void; emoji: string; adder: { current: (files: File[]) => void };
  /** the message being answered, and what to call who wrote it */
  replying: Message | null; replyName: string; onCancelReply: () => void;
  /** the message being edited: the box holds its text and Send becomes Save */
  editing: Message | null; onCancelEdit: () => void; onSaveEdit: (m: Message, text: string) => void;
};

function Composer({ onSend, emoji, adder, replying, replyName, onCancelReply, editing, onCancelEdit, onSaveEdit }: ComposerProps) {
  const s = useSession();
  const [text, setText] = useState("");
  const [preparing, setPreparing] = useState(0);
  const [pending, setPending] = useState<Pending[]>([]);
  const [panel, setPanel] = useState(false);
  const [camera, setCamera] = useState(false);
  /** On a small screen the camera and photo buttons fold into one arrow while you type, as in Messenger; the arrow brings them back. */
  const [toolsOpen, setToolsOpen] = useState(false);
  const shot = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const hasText = text.trim().length > 0;
  const compact = hasText && !toolsOpen;
  const ready = editing ? hasText && text.trim() !== editing.text.trim() : hasText || pending.length > 0;

  // Editing puts the message's words in the box; leaving edit mode (saved or cancelled) empties it again.
  const editId = editing?.id;
  useEffect(() => {
    if (!editId) return;
    setText(editing?.text ?? ""); setPanel(false);
    box.current?.focus();
    return () => setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a different message restarts the edit, not a refreshed copy of it
  }, [editId]);
  useEffect(() => { if (replying) box.current?.focus(); }, [replying?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addFiles(list: File[]) {
    if (editing) return; // an edit changes words only
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

  // The chat page hands pictures dropped anywhere on it to this box.
  adder.current = (list) => { void addFiles(list); };

  // The message appears in the chat at once (as "Sending…") and the box is cleared; if it cannot be sent, ThreadPage keeps it as "Not sent".
  function send() {
    if (!ready || preparing > 0) return;
    if (editing) { onSaveEdit(editing, text); return; }
    const body = text;
    const pics = pending;
    setPending([]); setText(""); setPanel(false);
    // a reply is attached to the first message of this send (the photos, else the words)
    let reply = replying ? replyRefOf(replying) : undefined;
    const go = (out: Outgoing) => { onSend(reply ? { ...out, reply } : out); reply = undefined; };
    for (const p of pics) go({ image: p.url });
    if (body.trim()) go({ text: body });
    if (replying) onCancelReply();
    box.current?.focus();
  }

  function pickMedia(media: Media) {
    setPanel(false);
    onSend({ ...(media.gif ? { gif: media.gif } : { text: media.sticker }), ...(replying ? { reply: replyRefOf(replying) } : {}) });
    if (replying) onCancelReply();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") { setPanel(false); if (editing) onCancelEdit(); else if (replying) onCancelReply(); }
    // "Enter sends the message" on: Enter sends and Shift+Enter adds a line. Off: Enter adds a line and Shift+Enter sends.
    if (e.key === "Enter" && !e.nativeEvent.isComposing && (enterSends() ? !e.shiftKey : e.shiftKey)) { e.preventDefault(); send(); }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pics = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (pics.length) { e.preventDefault(); void addFiles(pics); }
  }

  return (
    <div className="chat-compose">
      {(replying || editing) && (
        <div className="chat-context" role="status">
          <span className="chat-context-text">
            {editing ? <b>Editing message</b> : <>Replying to <b>{replyName}</b></>}
            <small>{snippetOf(editing ?? replying!).slice(0, 100)}</small>
          </span>
          <button type="button" className="icon-btn" aria-label={editing ? "Cancel editing" : "Cancel reply"} onClick={editing ? onCancelEdit : onCancelReply}><CloseIcon /></button>
        </div>
      )}
      {!editing && (pending.length > 0 || preparing > 0) && (
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
      {text.length >= MESSAGE_MAX && (
        <p className="chat-limit" role="alert"><AlertIcon />Character limit reached ({MESSAGE_MAX.toLocaleString()}). Shorten your message or send it in parts.</p>
      )}
      {panel && !editing && <MediaPicker onPick={pickMedia} onEmoji={(e) => insertEmoji(box.current, text, e, setText, MESSAGE_MAX)} />}
      {/* A div, not a form: iOS shows its "previous / next / done" bar for the fields of a form, which made the chat look like a search. */}
      <div className={`chat-composer${compact ? " compact" : ""}`} role="group" aria-label="Write a message">
        <div className="composer-tools">
          <button type="button" className="icon-btn tool tool-more" aria-label="Show camera and photos" title="Show camera and photos" aria-expanded={!compact}
            onClick={() => setToolsOpen(true)}><ChevronRightIcon /></button>
          <button type="button" className="icon-btn tool tool-media" aria-label="Take a photo" title="Take a photo" disabled={!!editing}
            onClick={() => (window.matchMedia("(pointer: coarse)").matches || !navigator.mediaDevices?.getUserMedia ? shot.current?.click() : setCamera(true))}><CameraIcon /></button>
          <button type="button" className="icon-btn tool tool-media" aria-label="Add photos" title="Add photos" disabled={!!editing}
            onClick={() => files.current?.click()}><ImageIcon /></button>
        </div>
        <div className="composer-field">
          <textarea ref={box} rows={1} value={text} maxLength={MESSAGE_MAX} placeholder="Aa" aria-label="Message"
            enterKeyHint={enterSends() ? "send" : "enter"} autoComplete="off" autoCorrect="on" autoCapitalize="sentences" spellCheck inputMode="text" name="vb-chat-message" aria-autocomplete="none"
            data-lpignore="true" data-1p-ignore="true" data-form-type="other"
            onFocus={() => setToolsOpen(false)} onChange={(e) => { setText(e.target.value); setToolsOpen(false); }} onKeyDown={onKey} onPaste={onPaste} />
          <button type="button" className={`icon-btn tool in-field${panel ? " on" : ""}`} aria-label="Emoji, stickers and GIFs" title="Emoji, stickers and GIFs" disabled={!!editing}
            aria-expanded={panel} onClick={() => setPanel((v) => !v)}><SmileIcon /></button>
        </div>
        {editing
          ? <button key="save" type="button" className="icon-btn send" aria-label="Save edit" title="Save edit" disabled={!ready} onClick={send}><CheckIcon /></button>
          : ready
            ? <button key="send" type="button" className="icon-btn send" aria-label="Send" disabled={preparing > 0} onClick={send}><SendIcon /></button>
            : <button key="like" type="button" className="icon-btn like" aria-label={`Send ${emoji}`} title={`Send ${emoji}`}
              onClick={() => { onSend({ text: emoji, ...(replying ? { reply: replyRefOf(replying) } : {}) }); if (replying) onCancelReply(); }}>{emoji}</button>}
        {/* on a phone this opens the camera app itself; the picture comes back like any other file */}
        <input ref={shot} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        <input ref={files} type="file" accept="image/*" multiple hidden
          onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>
      {camera && <CameraSheet onCapture={(f) => void addFiles([f])} onClose={() => setCamera(false)} />}
    </div>
  );
}

/** What a message request looks like from the person who got it. Nothing is sent or marked as read until they accept. */
function RequestBar({ other, name, onDone }: { other: string; name: string; onDone: () => void }) {
  const s = useSession();
  return (
    <div className="chat-request" role="region" aria-label="Message request">
      <p><b>{name}</b> is not your friend and wants to message you. They will not know you have read this until you accept.</p>
      <div className="chat-request-actions">
        <button type="button" className="btn primary"
          onClick={() => acceptChat(s.uid, other).then(() => s.notify("Chat accepted"), () => s.notify("Could not accept the request. Deploy the Firestore rules first."))}>Accept</button>
        <button type="button" className="btn"
          onClick={() => deleteChatForMe(s.uid, other).then(() => { s.notify("Request deleted"); onDone(); }, () => s.notify("Could not delete the request"))}>Delete</button>
      </div>
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

  const keysReady = useE2ee().phase === "ready";
  const settings = useChatSettings(s.uid, other);
  const quickEmoji = usePreferences().quickEmoji || DEFAULT_QUICK_EMOJI;
  const presence = usePresence(other);
  const prefs = s.chats.prefsOf(other);
  const blocked = s.chats.blocked.has(other);
  const blockedBy = useBlockedBy(s.uid, other);
  const restricted = s.chats.restricted.has(other);
  const [count, setCount] = useState(PAGE);
  const { messages, hasMore, loading, error } = useMessages(s.uid, other, count, prefs.clearedAt);
  const chat = s.chats.all.find((c) => c.other === other);
  const friend = s.friends.has(other);
  const unread = chat ? isUnread(chat, s.uid) && !chat.request : false;
  const chatRef = useRef(chat); chatRef.current = chat;
  const friendRef = useRef(friend); friendRef.current = friend;
  // Friends, accepted chats and chats from before requests can write; with a request you got you answer by accepting it, and
  // with one you sent you wait for the answer.
  const open = chat ? !chat.request && !chat.waiting : friend;

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
  // Reply, react, forward, pin, edit, unsend and report. Messages are kept by id so a refreshed copy (or one that was just
  // unsent) is always the current one.
  const { reactions, pins, pinsReady } = useChatExtras(s.uid, other);
  const [menuId, setMenuId] = useState("");
  const [forwardId, setForwardId] = useState("");
  const [reportId, setReportId] = useState("");
  const [unsendId, setUnsendId] = useState("");
  const [replyId, setReplyId] = useState("");
  const [editId, setEditId] = useState("");
  const [flash, setFlash] = useState("");
  const [jumpTo, setJumpTo] = useState("");
  // Pictures dragged onto the conversation go into the message box, when the box is there (not for a request, a block or locked keys).
  const adder = useRef<(files: File[]) => void>(() => undefined);
  const canCompose = !(chat?.request && !blocked) && !blocked && !blockedBy && !chat?.waiting && keysReady;
  const { over, bind } = useImageDrop((files) => adder.current(files), { disabled: !canCompose, onRejected: () => s.notify("Only pictures can be sent here.") });

  const changeFailed = useCallback((fn: (cur: Failed[]) => Failed[]) => setFailed((cur) => {
    const next = fn(cur);
    outboxes.set(other, next);
    return next;
  }), [other]);
  // Sending never blocks the box: the message shows up as "Sending…", and if the server turns it down it comes back here.
  const dispatch = useCallback((out: Outgoing) => {
    stick.current = true;
    sendMessage(s.uid, other, out, chatRef.current ? undefined : { friend: friendRef.current }).catch((err) => changeFailed((cur) => [...cur, { key: failedSeq++, out, reason: failureReason(err) }]));
  }, [s.uid, other, changeFailed]);
  const retry = (f: Failed) => { changeFailed((cur) => cur.filter((x) => x.key !== f.key)); dispatch(f.out); };
  const discard = (f: Failed) => changeFailed((cur) => cur.filter((x) => x.key !== f.key));

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.id)), [pins]);
  const menuMsg = byId.get(menuId);
  const replying = byId.get(replyId) ?? null;
  const editing = byId.get(editId) ?? null;
  // the newest real message: a line about the chat (a pin, a new emoji) is never the inbox preview
  const latest = useMemo(() => [...messages].reverse().find((m) => !m.sys), [messages]);
  const tell = (what: string) => (err: unknown) =>
    s.notify(err instanceof RateLimitError ? err.message : `Could not ${what}. If you just updated the app, deploy the Firestore rules first.`);

  function react(m: Message, emoji: string) {
    const mine = (reactions.get(m.id) ?? []).find((r) => r.by === s.uid)?.emoji;
    setReaction(s.uid, other, m.id, mine === emoji ? null : emoji).catch(tell("add your reaction"));
  }
  function togglePin(m: Message) {
    const pinned = pinnedIds.has(m.id);
    (pinned ? unpinMessage(s.uid, other, m.id) : pinMessage(s.uid, other, m)).then(
      () => s.notify(pinned ? "Unpinned. You can see pinned messages in chat info." : "Pinned. You can see pinned messages in chat info."), tell(pinned ? "unpin the message" : "pin the message"));
  }
  function copy(m: Message) {
    void copyText(m.text).then((ok) => { if (ok) s.notify("Copied"); else s.manualCopy(m.text); });
  }
  function saveEdit(m: Message, text: string) {
    editMessage(s.uid, other, m, text, m.id === latest?.id && chat?.lastFrom === s.uid).then(
      () => { setEditId(""); s.notify("Message edited"); },
      (err) => {
        // our own checks ("Message is empty") and the rate limit explain themselves; a refusal from the database gets the usual hint
        if (err instanceof RateLimitError || !(err as { code?: string }).code) s.notify(err instanceof Error ? err.message : "Could not edit the message.");
        else tell("edit the message")(err);
      },
    );
  }
  function unsend(m: Message) {
    setUnsendId("");
    if (replyId === m.id) setReplyId("");
    if (editId === m.id) setEditId("");
    unsendMessage(s.uid, other, m, m.id === latest?.id && chat?.lastFrom === s.uid).then(() => s.notify("Message unsent"), tell("unsend the message"));
  }
  /** Scrolls to a message and lights it up for a moment. A message older than what is loaded is fetched first. */
  function jump(id: string) { setFinding(false); setQ(""); setJumpTo(id); }
  useEffect(() => {
    if (!jumpTo) return;
    const el = body.current?.querySelector(`[data-mid="${jumpTo}"]`);
    if (el) {
      stick.current = false;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlash(jumpTo); setJumpTo("");
      const t = window.setTimeout(() => setFlash(""), 1600);
      return () => clearTimeout(t);
    }
    if (loading) return;
    if (hasMore && messages.length >= count) setCount((n) => n + SEARCH_WINDOW);
    else if (!hasMore) { s.notify("That message is no longer in this chat."); setJumpTo(""); }
  }, [jumpTo, messages, loading, hasMore, count]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opening a conversation, or getting a message while it is open, marks it read (the other person is only told if read receipts are on).
  useEffect(() => {
    // a restricted person never gets a read receipt, whatever your receipts setting is
    if (unread) markRead(s.uid, other, prefs.receipts && !restricted).catch(() => {});
  }, [unread, prefs.receipts, restricted, s.uid, other]);

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

  if (p === null && !navigator.onLine) return <NetworkUnavailable back={{ href: "#/messages", label: "Back to messages" }} />;
  if (p === null) {
    return (
      <div className="empty">
        <h2>Person not found</h2>
        <p>This person may not have set up VibeBook yet.</p>
        <a className="btn" href="#/messages">Back to messages</a>
      </div>
    );
  }

  const realName = p === undefined ? "…" : p.displayName || "VibeBook member";
  const name = calledBy(settings, other, realName);
  const nameLoading = p === undefined || !settings.loaded; // show a grey bar instead of "…" while who this is (or what they are called here) is unknown
  const olderLoading = hasMore && !loading && messages.length < count; // older messages are on their way

  return (
    <div className={`chat${over ? " drop-over" : ""}${settings.theme !== "default" ? " chat-themed" : ""}`} style={themeStyle(settings.theme)} ref={frame} {...bind}>
      {over && <DropHint label="Drop photos to add them to your message" />}
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
          <a className="chat-who" href={personHash(other, p)} aria-label={nameLoading ? "Open profile" : `Open ${name}'s profile`}>
            <Avatar profile={p} size="md" active={presence.status === "active"} />
            <span className="chat-who-text">
              <b>{nameLoading ? <NameSkeleton /> : name}</b>
              {presence.label
                ? <span className={presence.status === "active" ? "chat-active-now" : undefined}>{presence.label}</span>
                : p?.username ? <span>@{p.username}</span> : null}
            </span>
          </a>
          <button type="button" className="icon-btn" aria-label="Chat info and options" title="Chat info, search and options" aria-haspopup="dialog" onClick={() => setInfoOpen(true)}><InfoIcon /></button>
        </header>
      )}
      {finding && hasMore && (
        <p className="chat-find-note">
          Searching your latest {messages.length} messages.{" "}
          <button type="button" className="link-act" onClick={() => setCount((n) => n + SEARCH_WINDOW)}>Search older messages</button>
        </p>
      )}

      <div className="chat-main">
        <div className={`chat-body${keysReady ? "" : " e2ee-blur"}`} ref={body} onScroll={onScroll} aria-live="polite">
          <div className="chat-stream">
            {error && <p className="error note" role="alert">{error}</p>}
            {loading && <MessagesSkeleton />}
            {olderLoading && <div className="chat-more-sk"><MessagesSkeleton count={2} label="Loading earlier messages" /></div>}
            {hasMore && !loading && !olderLoading && (
              <button type="button" className="btn small chat-more" onClick={loadEarlier}>Load earlier messages</button>
            )}
            {!hasMore && !loading && !error && (
              <div className="chat-intro">
                <Avatar profile={p} size="lg" active={presence.status === "active"} />
                <b>{nameLoading ? <NameSkeleton /> : name}</b>
                {presence.label
                  ? <span className={presence.status === "active" ? "chat-active-now" : undefined}>{presence.label}</span>
                  : p?.username ? <span>@{p.username}</span> : null}
                <a className="btn small" href={personHash(other, p)}>View profile</a>
                {messages.length === 0 && <p className="hint">No messages yet. Say hello.</p>}
              </div>
            )}
            <Bubbles quickEmoji={quickEmoji} onReply={(m) => { setEditId(""); setReplyId(m.id); }} messages={messages} loading={loading} me={s.uid} other={p} otherSeenAt={prefs.receipts ? chat?.otherSeenAt ?? 0 : 0}
              q={finding ? q : ""} activeId={finding ? activeId : ""} onPhoto={setViewer}
              nameOf={(uid) => (uid === s.uid ? "You" : name)} realName={realName} reactions={reactions} pinned={pinnedIds} flash={flash} canAct={canCompose}
              onMenu={(m) => setMenuId(m.id)} onReact={react} onJump={jump} />
            {failed.map((f) => (
              <div key={f.key} className="msg mine solo failed" role="group" aria-label="Message not sent">
                <div className="msg-row">
                  <div className="msg-col">
                    {f.out.image && <img className="msg-gif" src={f.out.image} alt="Photo not sent" />}
                    {f.out.gif && <LoadingImg className="msg-gif" src={f.out.gif} alt="GIF not sent" referrerPolicy="no-referrer" />}
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

      {chat?.request && !blocked && !blockedBy ? (
        <RequestBar other={other} name={name} onDone={() => { location.hash = "#/messages"; }} />
      ) : blocked ? (
        <p className="hint chat-locked">
          You blocked {name}. You cannot message each other.{" "}
          <button type="button" className="link-act" onClick={() => unblockPerson(s.uid, other).then(() => s.notify(`Unblocked ${name}`), () => s.notify("Could not unblock"))}>Unblock</button>
        </p>
      ) : blockedBy ? (
        <p className="hint chat-locked">{name} blocked you. You cannot message each other.</p>
      ) : chat?.waiting ? (
        <p className="hint chat-locked">{name} is not your friend yet, so your message is a request. You can send more once they accept it.</p>
      ) : !keysReady ? (
        <E2eePrompt />
      ) : (
        <>
          {restricted && (
            <p className="hint chat-restricted" role="status">
              You restricted {name}. Their messages go to message requests, and they cannot see when you read them.{" "}
              <button type="button" className="link-act" onClick={() => unrestrictPerson(s.uid, other).then(() => s.notify(`Unrestricted ${name}`), () => s.notify("Could not unrestrict"))}>Unrestrict</button>
            </p>
          )}
          {!chat && !friend && <p className="hint chat-locked">{name} is not your friend, so your first message goes to them as a message request.</p>}
          <Composer onSend={dispatch} emoji={settings.emoji} adder={adder}
            replying={replying} replyName={replying ? (replying.from === s.uid ? "yourself" : name) : ""} onCancelReply={() => setReplyId("")}
            editing={editing} onCancelEdit={() => setEditId("")} onSaveEdit={saveEdit} />
        </>
      )}
      {menuMsg && !menuMsg.unsent && (
        <MessageActions message={menuMsg} mine={menuMsg.from === s.uid} pinned={pinnedIds.has(menuMsg.id)} pinsFull={pins.length >= PIN_MAX}
          myReaction={(reactions.get(menuMsg.id) ?? []).find((r) => r.by === s.uid)?.emoji}
          onReact={(emoji) => react(menuMsg, emoji)} onReply={() => { setEditId(""); setReplyId(menuMsg.id); }} onCopy={() => copy(menuMsg)}
          onForward={() => setForwardId(menuMsg.id)} onPin={() => togglePin(menuMsg)}
          onEdit={() => { setReplyId(""); setEditId(menuMsg.id); }} onReport={() => setReportId(menuMsg.id)} onUnsend={() => setUnsendId(menuMsg.id)}
          onClose={() => setMenuId("")} />
      )}
      {byId.get(forwardId) && <ForwardSheet message={byId.get(forwardId)!} onClose={() => setForwardId("")} />}
      {byId.get(reportId) && (
        <ReportMessageSheet message={byId.get(reportId)!} other={other} name={name} onClose={() => setReportId("")}
          onBlock={() => void blockPerson(s.uid, other).then(() => s.notify(`Blocked ${name}`), () => s.notify("Could not block"))} />
      )}
      {byId.get(unsendId) && (
        <ConfirmDialog title="Unsend this message?" confirmLabel="Unsend" danger onCancel={() => setUnsendId("")} onConfirm={() => unsend(byId.get(unsendId)!)}>
          <p>It is removed for both of you. {name} may already have seen it.</p>
        </ConfirmDialog>
      )}
      {infoOpen && (
        <ChatInfoSheet uid={other} profile={p} friend={open} settings={settings} messages={messages} hasMore={hasMore}
          pins={pins} pinsReady={pinsReady} canUnpin={canCompose} onUnpin={(id) => unpinMessage(s.uid, other, id).catch(tell("unpin the message"))}
          onJump={(id) => { setInfoOpen(false); jump(id); }}
          onLoadOlder={() => setCount((n) => n + SEARCH_WINDOW)} onPhoto={setViewer}
          onClose={() => setInfoOpen(false)} onSearch={() => { setInfoOpen(false); openSearch(); }} />
      )}
      {viewer && <ImageViewer src={viewer} label="Photo" onClose={() => setViewer("")} />}
    </div>
  );
}
