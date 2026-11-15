import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  forwardMessage, REACTIONS, REPORT_REASONS, reportMessage, snippetOf, type Message, type Reaction, type ReplyRef,
} from "./messages";
import { RateLimitError } from "./rateLimit";
import { useProfile, useSession } from "./session";
import { useScrollLock } from "./scrollLock";
import Avatar from "./Avatar";
import EmojiPicker from "./EmojiPicker";
import FormError from "./FormError";
import { CheckIcon, CloseIcon, CopyIcon, EditIcon, FlagIcon, ForwardIcon, PinIcon, PlusIcon, ReplyIcon, UndoIcon } from "./icons";
import { ArrowLeftIcon } from "./icons";

/** A sheet with a title and a close button, like the other chat sheets. Escape or a tap outside closes it. */
function Panel({ title, onClose, onBack, children, className = "" }: { title: string; onClose: () => void; onBack?: () => void; children: ReactNode; className?: string }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (onBack) onBack(); else onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onBack]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet msg-sheet ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          {onBack && <button type="button" className="icon-btn sheet-back" aria-label="Back" onClick={onBack}><ArrowLeftIcon /></button>}
          <h2>{title}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- what you can do with one message ----------

type ActionsProps = {
  message: Message;
  mine: boolean;
  /** your current reaction to it, if any */
  myReaction: string | undefined;
  pinned: boolean;
  /** the pin list is full: pinning one more is not possible */
  pinsFull: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onPin: () => void;
  onEdit: () => void;
  onReport: () => void;
  onUnsend: () => void;
  onClose: () => void;
};

/** Opens on a long press (touch), a right click, or the ... button next to a message: react, reply, forward, pin, edit, report, unsend. */
export function MessageActions(p: ActionsProps) {
  const [more, setMore] = useState(false);
  const m = p.message;
  const canEdit = p.mine && m.text !== "" && !m.pending;
  const done = (f: () => void) => () => { p.onClose(); f(); };
  const preview = snippetOf(m);
  return (
    <Panel title={more ? "Pick a reaction" : "Message"} onClose={p.onClose} onBack={more ? () => setMore(false) : undefined} className="msg-actions">
      {more ? (
        <EmojiPicker onPick={(e) => { p.onClose(); p.onReact(e); }} />
      ) : (
        <>
          {preview && <p className="msg-actions-preview">{preview.length > 140 ? `${preview.slice(0, 140)}…` : preview}</p>}
          <div className="react-row" role="group" aria-label="React to this message">
            {REACTIONS.map((e) => (
              <button key={e} type="button" className={p.myReaction === e ? "on" : ""} aria-pressed={p.myReaction === e} aria-label={`React ${e}`}
                onClick={done(() => p.onReact(e))}>{e}</button>
            ))}
            <button type="button" aria-label="More reactions" onClick={() => setMore(true)}><PlusIcon /></button>
          </div>
          <div className="action-list" role="menu">
            <button type="button" role="menuitem" className="action-row" onClick={done(p.onReply)}><i><ReplyIcon /></i>Reply</button>
            {m.text !== "" && <button type="button" role="menuitem" className="action-row" onClick={done(p.onCopy)}><i><CopyIcon /></i>Copy text</button>}
            <button type="button" role="menuitem" className="action-row" onClick={done(p.onForward)}><i><ForwardIcon /></i>Forward</button>
            <button type="button" role="menuitem" className="action-row" disabled={!p.pinned && p.pinsFull} onClick={done(p.onPin)}>
              <i><PinIcon /></i><span>{p.pinned ? "Unpin" : "Pin"}{!p.pinned && p.pinsFull && <small>Unpin one first. Chats keep up to 10 pins.</small>}</span>
            </button>
            {canEdit && <button type="button" role="menuitem" className="action-row" onClick={done(p.onEdit)}><i><EditIcon /></i>Edit</button>}
            {!p.mine && <button type="button" role="menuitem" className="action-row" onClick={done(p.onReport)}><i><FlagIcon /></i>Report</button>}
            {p.mine && !m.pending && (
              <button type="button" role="menuitem" className="action-row danger" onClick={done(p.onUnsend)}>
                <i><UndoIcon /></i><span>Unsend<small>Removes it for both of you</small></span>
              </button>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

// ---------- forward ----------

function FriendChoice({ uid, picked, onToggle }: { uid: string; picked: boolean; onToggle: () => void }) {
  const p = useProfile(uid);
  const name = p === undefined ? "…" : p?.displayName || "VibeBook member";
  return (
    <label className={`invite-row${picked ? " on" : ""}`}>
      <input type="checkbox" checked={picked} onChange={onToggle} />
      <Avatar profile={p} size="sm" />
      <span className="invite-name">{name}{p?.username && <small>@{p.username}</small>}</span>
      {picked && <CheckIcon />}
    </label>
  );
}

/** Pick friends to send a copy of the message to. Each one gets it as its own message, marked "Forwarded". */
export function ForwardSheet({ message, onClose }: { message: Message; onClose: () => void }) {
  const s = useSession();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const friends = useMemo(() => Array.from(s.friends), [s.friends]);
  const toggle = (uid: string) => setPicked((l) => (l.includes(uid) ? l.filter((x) => x !== uid) : [...l, uid]));

  async function send() {
    setBusy(true);
    try {
      const { sent, failed } = await forwardMessage(s.uid, message, picked.map((uid) => ({
        uid, first: s.chats.all.some((c) => c.other === uid) ? undefined : { friend: true },
      })));
      if (failed.length === 0) s.notify(sent.length === 1 ? "Message forwarded" : `Message forwarded to ${sent.length} people`);
      else if (sent.length === 0) s.notify(failed[0].reason);
      else s.notify(`Forwarded to ${sent.length}. ${failed.length} could not get it: ${failed[0].reason}`);
      if (sent.length > 0) onClose();
    } catch (err) {
      s.notify(err instanceof RateLimitError ? err.message : "Could not forward the message.");
    } finally { setBusy(false); }
  }

  return (
    <Panel title="Forward message" onClose={onClose}>
      <p className="msg-actions-preview">{snippetOf(message).slice(0, 140)}</p>
      {friends.length === 0 ? <p className="hint">Add some friends first, then you can forward messages to them.</p> : (
        <div className="invite-list">{friends.map((uid) => <FriendChoice key={uid} uid={uid} picked={picked.includes(uid)} onToggle={() => toggle(uid)} />)}</div>
      )}
      <div className="sheet-actions msg-inline-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy || picked.length === 0} onClick={() => void send()}>
          {busy ? "Sending…" : picked.length > 1 ? `Forward to ${picked.length}` : "Forward"}
        </button>
      </div>
    </Panel>
  );
}

// ---------- report ----------

/** Report a message from the other person. They are not told. */
export function ReportMessageSheet({ message, other, name, onClose, onBlock }: {
  message: Message; other: string; name: string; onClose: () => void; onBlock: () => void;
}) {
  const s = useSession();
  const id = useId();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true); setError("");
    try {
      await reportMessage(s.uid, other, message, reason, details);
      setSent(true);
    } catch (err) {
      setError(err instanceof RateLimitError ? err.message : "The report could not be sent. If you just updated the app, deploy the Firestore rules first.");
    } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <Panel title="Report sent" onClose={onClose}>
        <p>Thank you. {name} is not told who reported them. If you would rather not get messages from them, you can block them.</p>
        <div className="sheet-actions msg-inline-actions">
          <button type="button" className="btn" onClick={() => { onClose(); onBlock(); }}>Block {name}</button>
          <button type="button" className="btn primary" onClick={onClose}>Done</button>
        </div>
      </Panel>
    );
  }
  return (
    <Panel title="Report message" onClose={onClose}>
      <p className="hint">Messages are private and encrypted, so the report only includes what you send here: the words of this message{message.image ? ", and that it had a photo" : message.gif ? ", and that it had a GIF" : ""}, with the reason you pick. {name} is not told.</p>
      {message.text && <p className="msg-actions-preview">{message.text.slice(0, 200)}</p>}
      <fieldset className="report-reasons">
        <legend>Why are you reporting it?</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r} className={`invite-row${reason === r ? " on" : ""}`}>
            <input type="radio" name={`${id}-reason`} checked={reason === r} onChange={() => setReason(r)} />
            <span className="invite-name">{r}</span>
            {reason === r && <CheckIcon />}
          </label>
        ))}
      </fieldset>
      <label>Anything else we should know? <small>(optional)</small>
        <textarea rows={3} maxLength={300} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      {error && <FormError>{error}</FormError>}
      <div className="sheet-actions msg-inline-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy || !reason} onClick={() => void submit()}>{busy ? "Sending…" : "Send report"}</button>
      </div>
    </Panel>
  );
}

// ---------- pieces drawn in and around a bubble ----------

/** The quoted message above a reply. A tap jumps to the original. */
export function ReplyQuote({ reply, who, original, mine, onJump }: {
  reply: ReplyRef; who: string; original: Message | undefined; mine: boolean; onJump: (id: string) => void;
}) {
  const gone = original?.unsent === true;
  const text = gone ? "Message unsent" : snippetOf({ text: reply.text, image: reply.image, gif: reply.gif });
  return (
    <button type="button" className={`reply-quote${mine ? " mine" : ""}${gone ? " gone" : ""}`} onClick={() => onJump(reply.id)}
      aria-label={`Replying to ${who}: ${text}. Go to message`}>
      <b>{who}</b>
      <span>{text}</span>
    </button>
  );
}

/** The emoji under a message, with a count when more than one person used it. Tap one to react the same way (or take yours back). */
export function ReactionChips({ list, me, onToggle }: { list: Reaction[]; me: string; onToggle: (emoji: string) => void }) {
  const groups = useMemo(() => {
    const by = new Map<string, { n: number; mine: boolean }>();
    for (const r of list) { const g = by.get(r.emoji) ?? { n: 0, mine: false }; g.n += 1; g.mine ||= r.by === me; by.set(r.emoji, g); }
    return Array.from(by, ([emoji, g]) => ({ emoji, ...g }));
  }, [list, me]);
  if (groups.length === 0) return null;
  return (
    <div className="msg-reacts" role="group" aria-label="Reactions">
      {groups.map((g) => (
        <button key={g.emoji} type="button" className={g.mine ? "on" : ""} aria-pressed={g.mine}
          aria-label={`${g.emoji} ${g.n}${g.mine ? ", yours. Tap to remove" : ""}`} onClick={() => onToggle(g.emoji)}>
          {g.emoji}{g.n > 1 && <small>{g.n}</small>}
        </button>
      ))}
    </div>
  );
}

