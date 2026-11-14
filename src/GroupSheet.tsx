import { useEffect, useRef, useState, type FormEvent } from "react";
import { createGroup, GROUP_DESC_MAX, GROUP_NAME_MAX } from "./groups";
import { useSession } from "./session";
import { CloseIcon } from "./icons";
import { canAutoFocus } from "./focus";
import GroupAccessFields from "./GroupAccessFields";
import type { GroupPrivacy } from "./types";
import { useScrollLock } from "./scrollLock";

export default function GroupSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { uid } = useSession();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<GroupPrivacy>("public");
  const [questions, setQuestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useScrollLock();
  useEffect(() => {
    if (canAutoFocus()) nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(await createGroup(uid, name, description, privacy, questions));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="New group" onSubmit={submit}>
        <div className="sheet-head">
          <h2>New group</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <label>Name
            <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} required
              maxLength={GROUP_NAME_MAX} placeholder="e.g. BSIT 4A interns" />
          </label>
          <label>What is it for? <small>(optional)</small>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              maxLength={GROUP_DESC_MAX} placeholder="Who should join, and what do you share here?" />
          </label>
          <GroupAccessFields privacy={privacy} questions={questions} onPrivacy={setPrivacy} onQuestions={setQuestions} disabled={busy} />
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create group"}
          </button>
        </div>
      </form>
    </div>
  );
}
