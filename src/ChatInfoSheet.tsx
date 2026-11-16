import { useEffect, useMemo, useState } from "react";
import { personHash } from "./profiles";
import { usePreferences } from "./preferences";
import { useScrollLock } from "./scrollLock";
import { useSession } from "./session";
import {
  calledBy, DEFAULT_EMOJI, isUnread, NICK_MAX, setChatEmoji, setNickname, type ChatSettings, type Message, type Pin,
} from "./messages";
import { NameSkeleton, RowsSkeleton } from "./Skeleton";
import { muteLabel, useChatCommands } from "./chatCommands";
import Avatar from "./Avatar";
import EmojiPicker from "./EmojiPicker";
import MuteChoices from "./MuteChoices";
import type { Profile } from "./types";
import {
  ArchiveIcon, ArrowLeftIcon, BellIcon, BellOffIcon, BlockIcon, ChevronRightIcon, CloseIcon, EditIcon, ImageIcon, PinIcon, ReceiptsIcon, RestrictIcon,
  SearchIcon, SmileIcon, TrashIcon, UnarchiveIcon, UserIcon,
} from "./icons";

type Props = {
  uid: string;
  profile: Profile | null | undefined;
  friend: boolean;
  settings: ChatSettings;
  /** the messages loaded so far (photos and GIFs are listed from these) */
  messages: Message[];
  hasMore: boolean;
  /** messages either of you pinned, newest pin first */
  pins: Pin[];
  /** pins can be removed (nothing can be written in a blocked chat or a request) */
  canUnpin: boolean;
  /** false while the pins are still being read (the list shows a placeholder, not "nothing pinned") */
  pinsReady?: boolean;
  onUnpin: (id: string) => void;
  /** close this panel and scroll the chat to that message */
  onJump: (id: string) => void;
  onLoadOlder: () => void;
  onPhoto: (src: string) => void;
  onSearch: () => void;
  onClose: () => void;
};

type View = "main" | "emoji" | "nicknames" | "media" | "pins" | "mute";
const TITLE: Record<View, string> = { main: "Chat info", emoji: "Emoji", nicknames: "Nicknames", media: "Photos & GIFs", pins: "Pinned messages", mute: "Mute notifications" };

/**
 * What opens when you tap the person at the top of a conversation, like the info panel in Messenger: who they are, quick
 * buttons (Profile, Mute, Search) and this chat's settings: the quick emoji, nicknames, photos and GIFs shared here, read
 * receipts, mute, archive, block and delete. The emoji and nicknames are shared with the other person; the rest is yours.
 */
export default function ChatInfoSheet({ uid, profile, friend, settings, messages, hasMore, pins, pinsReady = true, canUnpin, onUnpin, onJump, onLoadOlder, onPhoto, onSearch, onClose }: Props) {
  const s = useSession();
  const prefs = usePreferences();
  const [view, setView] = useState<View>("main");
  const realName = profile === undefined ? "…" : profile?.displayName || "VibeBook member";
  const name = calledBy(settings, uid, realName);
  const chat = s.chats.all.find((c) => c.other === uid);
  const mine = s.chats.prefsOf(uid);
  const muted = chat?.muted ?? false;
  const blocked = s.chats.blocked.has(uid);
  const restricted = s.chats.restricted.has(uid);
  const archived = s.chats.archived.some((c) => c.other === uid);
  const unread = chat ? isUnread(chat, s.uid) : false;
  const cmd = useChatCommands(uid, name, mine, onClose);

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (view === "main") onClose(); else setView("main"); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, view]);

  const media = useMemo(() => messages.filter((m) => m.image || m.gif).reverse(), [messages]);
  const back = () => setView("main");

  if (cmd.dialogs) return <>{cmd.dialogs}</>;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet chat-info" role="dialog" aria-modal="true" aria-label={`Chat with ${name}`}>
        <div className="sheet-head">
          {view !== "main" && (
            <button type="button" className="icon-btn sheet-back" aria-label="Back to chat info" onClick={back}><ArrowLeftIcon /></button>
          )}
          <h2>{TITLE[view]}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          {view === "main" && (
            <>
              <div className="chat-info-who">
                <Avatar profile={profile} size="lg" />
                <b>{name}</b>
                {name !== realName && <span>{realName}</span>}
                {profile?.username && <span>@{profile.username}</span>}
                <small>{blocked ? "Blocked" : restricted ? "Restricted" : friend ? "Friends on VibeBook" : "Not friends yet"}</small>
              </div>

              <div className="chat-info-actions">
                <a className="chat-info-act" href={personHash(uid, profile)} onClick={onClose}>
                  <i><UserIcon /></i>Profile
                </a>
                <button type="button" className={`chat-info-act${muted ? " on" : ""}`} aria-pressed={muted}
                  onClick={() => (muted ? void cmd.unmute() : setView("mute"))}>
                  <i>{muted ? <BellOffIcon /> : <BellIcon />}</i>{muted ? "Unmute" : "Mute"}
                </button>
                <button type="button" className="chat-info-act" onClick={onSearch}>
                  <i><SearchIcon /></i>Search
                </button>
              </div>

              <section className="chat-info-section" aria-label="Messages">
                <h3>Messages</h3>
                <button type="button" className="action-row" onClick={() => setView("pins")}>
                  <i><PinIcon /></i>
                  <span>Pinned messages<small>{!pinsReady && pins.length === 0 ? <NameSkeleton /> : pins.length > 0 ? `${pins.length} pinned in this chat` : "Press and hold a message, then choose Pin"}</small></span>
                  <ChevronRightIcon />
                </button>
              </section>

              <section className="chat-info-section" aria-label="Customize chat">
                <h3>Customize chat</h3>
                <button type="button" className="action-row" onClick={() => setView("emoji")}>
                  <i><SmileIcon /></i>
                  <span>Emoji<small>Sent by the button next to the message box</small></span>
                  <em className="action-value" aria-hidden="true">{settings.emoji}</em><ChevronRightIcon />
                </button>
                <button type="button" className="action-row" onClick={() => setView("nicknames")}>
                  <i><EditIcon /></i>
                  <span>Nicknames<small>{settings.nick[uid] ? `${realName} is “${settings.nick[uid]}”` : "Give each of you a nickname here"}</small></span>
                  <ChevronRightIcon />
                </button>
                <button type="button" className="action-row" onClick={() => setView("media")}>
                  <i><ImageIcon /></i>
                  <span>Photos &amp; GIFs<small>{media.length > 0 ? `${media.length}${hasMore ? "+" : ""} shared in this chat` : "Nothing shared yet"}</small></span>
                  <ChevronRightIcon />
                </button>
              </section>

              <section className="chat-info-section" aria-label="Privacy and notifications">
                <h3>Privacy &amp; notifications</h3>
                <label className="switch-row">
                  <span>Read receipts<small>
                    {mine.receipts
                      ? `${realName} can see when you have read their messages, and you can see when they have read yours`
                      : `Off: ${realName} cannot see when you read their messages, and you cannot see when they read yours`}
                  </small></span>
                  <input type="checkbox" role="switch" checked={mine.receipts} onChange={(e) => void cmd.receipts(e.target.checked)} />
                  <i className="switch" aria-hidden="true" />
                </label>
                <button type="button" className="action-row" onClick={() => setView("mute")}>
                  <i>{muted ? <BellOffIcon /> : <BellIcon />}</i>
                  <span>Mute notifications<small>{muted ? muteLabel(mine.mutedUntil || Number.MAX_SAFE_INTEGER) : "Off"}</small></span>
                  <ChevronRightIcon />
                </button>
                {unread && (
                  <button type="button" className="action-row" onClick={() => void cmd.markRead()}>
                    <i><ReceiptsIcon /></i>Mark as read
                  </button>
                )}
                <label className="switch-row">
                  <span>Enter sends the message<small>Off: Enter adds a new line. Applies to all chats on this device</small></span>
                  <input type="checkbox" role="switch" checked={enterOn(prefs.enterSends)} onChange={(e) => prefs.setEnterSends(e.target.checked)} />
                  <i className="switch" aria-hidden="true" />
                </label>
              </section>

              <section className="chat-info-section" aria-label="Manage chat">
                <h3>Manage chat</h3>
                <button type="button" className="action-row" onClick={() => void cmd.archive(!archived)}>
                  <i>{archived ? <UnarchiveIcon /> : <ArchiveIcon />}</i>{archived ? "Unarchive chat" : "Archive chat"}
                </button>
                <button type="button" className="action-row" onClick={() => (restricted ? void cmd.unrestrict() : cmd.askRestrict())}>
                  <i><RestrictIcon /></i>
                  <span>{restricted ? `Unrestrict ${name}` : `Restrict ${name}`}<small>{restricted ? "Their messages go to your chats again" : "Their messages go to message requests, and they will not know"}</small></span>
                </button>
                <button type="button" className="action-row" onClick={() => (blocked ? void cmd.unblock() : cmd.askBlock())}>
                  <i><BlockIcon /></i>
                  <span>{blocked ? `Unblock ${name}` : `Block ${name}`}<small>{blocked ? "You can message each other again" : "Neither of you can send messages"}</small></span>
                </button>
                <button type="button" className="action-row danger" onClick={cmd.askDelete}>
                  <i><TrashIcon /></i>
                  <span>Delete chat<small>Clears it for you only</small></span>
                </button>
              </section>
            </>
          )}

          {view === "emoji" && <EmojiView uid={uid} current={settings.emoji} friend={friend} onDone={back} />}
          {view === "nicknames" && <NicknamesView uid={uid} profile={profile} realName={realName} settings={settings} friend={friend} />}
          {view === "pins" && <PinsView pins={pins} ready={pinsReady} me={s.uid} name={name} canUnpin={canUnpin} onUnpin={onUnpin} onJump={onJump} />}
          {view === "media" && <MediaView media={media} hasMore={hasMore} onLoadOlder={onLoadOlder} onPhoto={onPhoto} />}
          {view === "mute" && (
            <MuteChoices prefs={mine} muted={muted}
              onPick={(ms) => { void cmd.mute(ms); back(); }} onUnmute={() => { void cmd.unmute(); back(); }} />
          )}
        </div>
      </div>
    </div>
  );
}

const enterOn = (v: "auto" | "on" | "off") => (v === "auto" ? !window.matchMedia("(pointer: coarse)").matches : v === "on");

/** Pick the emoji the quick-send button sends (both of you get the same one, as in Messenger). */
function EmojiView({ uid, current, friend, onDone }: { uid: string; current: string; friend: boolean; onDone: () => void }) {
  const s = useSession();
  function pick(emoji: string) {
    if (emoji === current) { onDone(); return; } // nothing changed, so nothing to announce
    setChatEmoji(s.uid, uid, emoji).then(
      () => s.notify(emoji === DEFAULT_EMOJI ? "Emoji set back to the thumbs up" : `Emoji changed to ${emoji}`),
      () => s.notify("Could not change the emoji. If you just updated the app, deploy the Firestore rules first."),
    );
    onDone();
  }
  return (
    <div className="emoji-view">
      <div className="emoji-current" aria-live="polite">
        <span aria-hidden="true">{current}</span>
        <small>The button beside the message box sends this</small>
      </div>
      {friend ? <EmojiPicker onPick={pick} /> : <p className="hint">You can change the emoji once this chat is open (you are friends, or they accepted your message request).</p>}
      {current !== DEFAULT_EMOJI && friend && (
        <button type="button" className="btn" onClick={() => pick(DEFAULT_EMOJI)}>Reset to {DEFAULT_EMOJI}</button>
      )}
    </div>
  );
}

/** One nickname per person in the chat, yours included. Both of you see them. */
function NicknamesView({ uid, profile, realName, settings, friend }: {
  uid: string; profile: Profile | null | undefined; realName: string; settings: ChatSettings; friend: boolean;
}) {
  const s = useSession();
  const meName = s.me?.displayName || "You";
  return (
    <div className="action-list nick-list">
      <p className="hint action-hint">{friend ? "Nicknames show in this chat for both of you." : "You can set nicknames once this chat is open (you are friends, or they accepted your message request)."}</p>
      <NicknameRow who={uid} profile={profile} realName={realName} current={settings.nick[uid] ?? ""} enabled={friend} />
      <NicknameRow who={s.uid} profile={s.me} realName={`${meName} (you)`} current={settings.nick[s.uid] ?? ""} enabled={friend} other={uid} />
    </div>
  );
}

function NicknameRow({ who, profile, realName, current, enabled, other }: {
  who: string; profile: Profile | null | undefined; realName: string; current: string; enabled: boolean; other?: string;
}) {
  const s = useSession();
  const chatWith = other ?? who; // the conversation is always "me and them"
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [busy, setBusy] = useState(false);

  function save(value: string) {
    if (value.trim() === current) { setEditing(false); return; } // nothing changed, so nothing to announce
    setBusy(true);
    setNickname(s.uid, chatWith, who, value).then(
      () => { setEditing(false); s.notify(value.trim() ? "Nickname saved" : "Nickname removed"); },
      () => s.notify("Could not save the nickname. If you just updated the app, deploy the Firestore rules first."),
    ).finally(() => setBusy(false));
  }

  if (!editing) {
    return (
      <button type="button" className="action-row" disabled={!enabled}
        onClick={() => { setDraft(current); setEditing(true); }}>
        <Avatar profile={profile} size="sm" />
        <span>{current || "Set nickname"}<small>{realName}</small></span>
        <EditIcon />
      </button>
    );
  }
  return (
    <form className="nick-edit" onSubmit={(e) => { e.preventDefault(); save(draft); }}>
      <label>{realName}
        <input value={draft} maxLength={NICK_MAX} autoFocus placeholder="Nickname" aria-label={`Nickname for ${realName}`}
          onChange={(e) => setDraft(e.target.value)} />
      </label>
      <div className="nick-actions">
        {current && <button type="button" className="btn" disabled={busy} onClick={() => save("")}>Remove</button>}
        <button type="button" className="btn" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
        <button type="submit" className="btn primary" disabled={busy || draft.trim() === current}>Save</button>
      </div>
    </form>
  );
}

/** Every photo and GIF in the messages loaded so far, newest first. A photo opens full screen. */
function MediaView({ media, hasMore, onLoadOlder, onPhoto }: { media: Message[]; hasMore: boolean; onLoadOlder: () => void; onPhoto: (src: string) => void }) {
  const [kind, setKind] = useState<"photos" | "gifs">("photos");
  const photos = media.filter((m) => m.image);
  const gifs = media.filter((m) => m.gif);
  const shown = kind === "photos" ? photos : gifs;
  return (
    <div className="media-view">
      <div className="inbox-chips" role="group" aria-label="Kind of media">
        <button type="button" className={`chip-btn${kind === "photos" ? " on" : ""}`} aria-pressed={kind === "photos"} onClick={() => setKind("photos")}>Photos ({photos.length})</button>
        <button type="button" className={`chip-btn${kind === "gifs" ? " on" : ""}`} aria-pressed={kind === "gifs"} onClick={() => setKind("gifs")}>GIFs ({gifs.length})</button>
      </div>
      {shown.length === 0 && <p className="note">{kind === "photos" ? "No photos in the messages loaded so far." : "No GIFs in the messages loaded so far."}</p>}
      {shown.length > 0 && (
        <ul className="media-grid">
          {shown.map((m) => (
            <li key={m.id}>
              {kind === "photos" ? (
                <button type="button" aria-label="Open photo" onClick={() => onPhoto(m.image)}><img src={m.image} alt="Photo" loading="lazy" /></button>
              ) : (
                <span><img src={m.gif} alt="GIF" loading="lazy" referrerPolicy="no-referrer" /></span>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasMore && <button type="button" className="btn" onClick={onLoadOlder}>Look through older messages</button>}
    </div>
  );
}

/** Every pinned message of this chat, newest pin first. "Show in chat" closes this panel and scrolls to it; either of you can unpin. */
function PinsView({ pins, ready, me, name, canUnpin, onUnpin, onJump }: {
  pins: Pin[]; ready: boolean; me: string; name: string; canUnpin: boolean; onUnpin: (id: string) => void; onJump: (id: string) => void;
}) {
  if (!ready && pins.length === 0) return <RowsSkeleton />;
  if (pins.length === 0) {
    return <p className="note">Nothing is pinned yet. Press and hold a message (or tap its ⋯ button on a computer) and choose Pin. Either of you can pin and unpin, and you both see the pins here.</p>;
  }
  const when = (ms: number) => (ms ? new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
  return (
    <ul className="pin-list">
      {pins.map((p) => (
        <li key={p.id} className="pin-item">
          <div className="pin-meta"><b>{p.from === me ? "You" : name}</b>{p.at > 0 && <span>{when(p.at)}</span>}</div>
          <p className="pin-text">{p.text || "Message"}</p>
          <div className="pin-actions">
            <button type="button" className="btn small" onClick={() => onJump(p.id)}>Show in chat</button>
            {canUnpin && <button type="button" className="btn small" onClick={() => onUnpin(p.id)}>Unpin</button>}
          </div>
        </li>
      ))}
    </ul>
  );
}
