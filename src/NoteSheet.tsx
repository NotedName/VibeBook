import { useEffect, useState, type FormEvent } from "react";
import { NOTE_MAX, setProfileNote } from "./profiles";
import { useSession } from "./session";
import { useScrollLock } from "./scrollLock";
import { CloseIcon } from "./icons";

/** Share, change or clear the 24-hour note. It shows at the top of Messages and on your profile and logbook until it expires. */
export default function NoteSheet({ initial, onClose }: { initial: string; onClose: () => void }) {
  const { uid, notify } = useSession();
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  useScrollLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await setProfileNote(uid, draft);
      notify(draft.trim() ? "24-hour note shared" : "Note cleared");
      onClose();
    } catch {
      notify("Could not update your note. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="Share a 24-hour note" onSubmit={submit}>
        <div className="sheet-head">
          <h2>Share a thought</h2>
          <button type="button" className="icon-btn close" aria-label="Close" disabled={busy} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <p className="hint">Visible at the top of Messages and on your profile for 24 hours.</p>
          <label>
            Note
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={NOTE_MAX}
              placeholder="Drop a thought..."
              autoFocus
            />
            <small className="count">{draft.length}/{NOTE_MAX}</small>
          </label>
        </div>
        <div className="sheet-actions">
          {initial && (
            <button
              type="button"
              className="btn danger-ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await setProfileNote(uid, "");
                  notify("Note cleared");
                  onClose();
                } catch {
                  notify("Could not clear your note.");
                  setBusy(false);
                }
              }}
            >
              Clear note
            </button>
          )}
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Share"}</button>
        </div>
      </form>
    </div>
  );
}
