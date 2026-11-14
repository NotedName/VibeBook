import { useEffect, useState, type FormEvent } from "react";
import { requestToJoin } from "./groups";
import { useSession } from "./session";
import { ANSWER_MAX, REQUEST_MESSAGE_MAX, type Group } from "./types";
import { CloseIcon } from "./icons";
import { GroupAvatar } from "./GroupRow";
import { useScrollLock } from "./scrollLock";

/** Ask to join a private group: a message about why, and an answer for each of the group's questions. */
export default function JoinRequestSheet({ group, onClose, onSent }: { group: Group; onClose: () => void; onSent?: () => void }) {
  const s = useSession();
  const [message, setMessage] = useState("");
  const [answers, setAnswers] = useState<string[]>(() => group.questions.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const ready = message.trim() !== "" && answers.every((a) => a.trim() !== "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestToJoin(s.uid, group, message, answers);
      s.notify("Request sent. You will be told when it is approved.");
      onSent?.();
      onClose();
    } catch (err) {
      const m = (err as Error).message;
      setError(/permission|insufficient/i.test(m) ? "That did not go through. You may already have a request waiting, or you were removed from this group." : m);
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={`Ask to join ${group.name}`} onSubmit={submit}>
        <div className="sheet-head">
          <h2>Ask to join</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <p className="join-who"><GroupAvatar name={group.name} photo={group.avatar} size="sm" /><b>{group.name}</b></p>
          <p className="hint">This is a private group. An admin or moderator reads your request and decides. Only members can see what is shared inside.</p>
          <label>Why would you like to join?
            <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={REQUEST_MESSAGE_MAX}
              placeholder="A sentence or two for the admins." />
            <small className="count">{message.length}/{REQUEST_MESSAGE_MAX}</small>
          </label>
          {group.questions.map((q, i) => (
            <label key={i}>{q}
              <textarea rows={2} value={answers[i]} required maxLength={ANSWER_MAX}
                onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
            </label>
          ))}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy || !ready}>{busy ? "Sending…" : "Send request"}</button>
        </div>
      </form>
    </div>
  );
}
