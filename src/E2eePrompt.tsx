import { useState, type FormEvent } from "react";
import { createKeys, generatePassphrase, MIN_PASSPHRASE, retryE2ee, unlockKeys, useE2ee } from "./e2ee";
import { EyeIcon, EyeOffIcon, LockIcon } from "./icons";

function reason(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

/** A passphrase field with a show/hide button. */
function PassphraseInput({ label, value, show, onShow, onChange, autoFocus, placeholder }: {
  label: string; value: string; show: boolean; onShow: () => void; onChange: (v: string) => void; autoFocus?: boolean; placeholder?: string;
}) {
  return (
    <label>{label}
      <span className="pw">
        <input type={show ? "text" : "password"} value={value} required autoFocus={autoFocus} placeholder={placeholder}
          autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="icon-btn" aria-label={show ? "Hide passphrase" : "Show passphrase"} aria-pressed={show} onClick={onShow}>
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </span>
    </label>
  );
}

/** First time (or starting over): a passphrase, typed twice. It protects the backup of your key, which lets a new device read your chats. */
function Setup({ reset, onCancel }: { reset: boolean; onCancel?: () => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (passphrase.length < MIN_PASSPHRASE) return setError(`Your passphrase needs at least ${MIN_PASSPHRASE} characters.`);
    if (passphrase !== confirm) return setError("The two passphrases do not match.");
    setError("");
    setBusy(true);
    try {
      await createKeys(passphrase);
    } catch (err) {
      setError(reason(err));
      setBusy(false);
    }
  }
  function suggest() {
    const p = generatePassphrase();
    setPassphrase(p); setConfirm(p); setShow(true);
  }

  return (
    <form className="e2ee-card" onSubmit={submit} noValidate>
      <h2><LockIcon />{reset ? "Start over with new encryption" : "Turn on encrypted messages"}</h2>
      {reset
        ? <p className="hint">Old messages cannot be read again, because they need your old key. New messages will work as usual. Choose a new passphrase.</p>
        : <p className="hint">Your messages are end-to-end encrypted: only you and the person you write to can read them. Choose a passphrase. You type it once on each new browser or device to open your chats, like a Messenger PIN. We cannot recover it for you.</p>}
      <PassphraseInput label="Passphrase" value={passphrase} show={show} onShow={() => setShow(!show)} onChange={setPassphrase}
        placeholder={`At least ${MIN_PASSPHRASE} characters`} autoFocus />
      <PassphraseInput label="Type it again" value={confirm} show={show} onShow={() => setShow(!show)} onChange={setConfirm} />
      <button type="button" className="link-act" onClick={suggest}>Suggest a strong one for me</button>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn primary wide" disabled={busy}>{busy ? "Please wait…" : reset ? "Start over" : "Turn on"}</button>
      {onCancel && <button type="button" className="btn wide" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

/** A new browser or device: one passphrase opens your old chats. */
function Unlock({ onForgot }: { onForgot: () => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await unlockKeys(passphrase);
    } catch (err) {
      setError(reason(err));
      setBusy(false);
    }
  }

  return (
    <form className="e2ee-card" onSubmit={submit} noValidate>
      <h2><LockIcon />Unlock your messages</h2>
      <p className="hint">Enter your encryption passphrase to read your chats on this browser. You only need to do this once here.</p>
      <PassphraseInput label="Passphrase" value={passphrase} show={show} onShow={() => setShow(!show)} onChange={setPassphrase} autoFocus />
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn primary wide" disabled={busy || !passphrase}>{busy ? "Please wait…" : "Unlock"}</button>
      <button type="button" className="link-act" onClick={onForgot}>Forgot your passphrase?</button>
    </form>
  );
}

/**
 * Shown wherever messages cannot be sent or read yet: nothing when the keys are ready on this device, otherwise the one
 * thing to do (set up, unlock, or try again).
 */
export default function E2eePrompt() {
  const { phase, error } = useE2ee();
  const [starting, setStarting] = useState(false);

  if (phase === "ready") return null;
  if (phase === "loading") return <p className="hint chat-locked">Checking your encryption keys…</p>;
  if (phase === "error") {
    return (
      <div className="e2ee-card">
        <p className="error" role="alert">{error}</p>
        <button type="button" className="btn wide" onClick={retryE2ee}>Try again</button>
      </div>
    );
  }
  if (phase === "setup") return <Setup reset={false} />;
  return starting ? <Setup reset onCancel={() => setStarting(false)} /> : <Unlock onForgot={() => setStarting(true)} />;
}
