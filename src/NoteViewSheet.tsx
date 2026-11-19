import { useEffect, useState, type FormEvent } from "react";
import { MESSAGE_MAX, sendMessage } from "./messages";
import { NOTE_TTL_MS, activeNoteText } from "./profiles";
import { threadHash } from "./ChatRow";
import { useProfile, useSession } from "./session";
import { useScrollLock } from "./scrollLock";
import Avatar from "./Avatar";
import { CloseIcon, SendIcon } from "./icons";

/** Someone else's 24-hour note, opened large, with a box to reply. The reply goes to your chat with them, as Messenger does. */
export default function NoteViewSheet({ uid, onClose }: { uid: string; onClose: () => void }) {
  const s = useSession();
  const p = useProfile(uid);
  useScrollLock();
  const note = activeNoteText(p);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const name = p?.displayName || "Member";
  const hoursLeft = p?.noteAt ? Math.max(1, Math.ceil((p.noteAt + NOTE_TTL_MS - Date.now()) / 3_600_000)) : 0;

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true); setError("");
    try {
      const quoted = `Replied to ${name.split(/\s+/)[0]}'s note: “${note}”\n${body}`.slice(0, MESSAGE_MAX);
      await sendMessage(s.uid, uid, { text: quoted }, { friend: s.relationOf(uid) === "friends" });
      s.notify("Reply sent");
      onClose();
    } catch (err) {
      setError((err as Error).message || "Could not send your reply. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="sheet note-view" role="dialog" aria-modal="true" aria-label={`${name}'s note`} onSubmit={send}>
        <div className="sheet-head">
          <h2>{name}’s note</h2>
          <button type="button" className="icon-btn close" aria-label="Close" disabled={busy} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <div className="note-view-card">
            <Avatar profile={p} size="lg" />
            <p className="note-view-text">{note || "This note has expired."}</p>
            {note && <small>{hoursLeft} {hoursLeft === 1 ? "hour" : "hours"} left</small>}
          </div>
          {note && (
            <>
              <label>Reply
                <textarea rows={2} value={text} maxLength={400} autoFocus placeholder={`Reply to ${name.split(/\s+/)[0]}'s note`} onChange={(e) => setText(e.target.value)} />
              </label>
              {error && <p className="error" role="alert">{error}</p>}
            </>
          )}
        </div>
        <div className="sheet-actions">
          <a className="btn" href={threadHash(uid)} onClick={onClose}>Open chat</a>
          {note && <button type="submit" className="btn primary" disabled={busy || !text.trim()}><SendIcon />{busy ? "Sending…" : "Send reply"}</button>}
        </div>
      </form>
    </div>
  );
}
