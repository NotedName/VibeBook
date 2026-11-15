import { useState, type FormEvent } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { authMessage } from "./authErrors";
import { changePassphrase, generatePassphrase, MIN_PASSPHRASE, useE2ee } from "./e2ee";
import E2eePrompt from "./E2eePrompt";
import NewPasswordFields from "./NewPasswordFields";
import { newPasswordProblem } from "./password";
import { useSession } from "./session";

/** Settings > Security > Password: asks for the current password, then the new one twice. */
function ChangePassword() {
  const { user, notify } = useSession();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // People who signed in with Google have no password here.
  if (!user.providerData.some((p) => p.providerId === "password")) {
    return <p className="hint">You sign in with Google, so your password is managed by your Google account.</p>;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = !current ? "Enter your current password." : newPasswordProblem(password, confirm)
      || (password === current ? "Choose a password different from your current one." : "");
    if (problem) return setError(problem);
    setError("");
    setBusy(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, current));
      await updatePassword(user, password);
      setCurrent(""); setPassword(""); setConfirm("");
      notify("Password changed");
    } catch (err) {
      setError(authMessage(err));
    }
    setBusy(false);
  }

  return (
    <form className="sec-form" onSubmit={submit} noValidate>
      <span className="setting-title">Change password</span>
      <label>Current password
        <input type="password" value={current} required autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn primary" disabled={busy}>{busy ? "Please wait…" : "Change password"}</button>
    </form>
  );
}

/** Settings > Security > Encrypted messages: set up or unlock them on this device, or change the passphrase that protects the key backup. */
function ChangePassphrase() {
  const { notify } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < MIN_PASSPHRASE) return setError(`Your new passphrase needs at least ${MIN_PASSPHRASE} characters.`);
    if (next !== confirm) return setError("The two new passphrases do not match.");
    setError("");
    setBusy(true);
    try {
      await changePassphrase(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      notify("Passphrase changed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
    setBusy(false);
  }
  function suggest() {
    const p = generatePassphrase();
    setNext(p); setConfirm(p);
  }

  return (
    <form className="sec-form" onSubmit={submit} noValidate>
      <p className="hint">Your chats are end-to-end encrypted and open on this device. The passphrase is what opens them on a new browser or device. Other devices keep working until you sign out of them.</p>
      <label>Current passphrase
        <input type="password" value={current} required autoComplete="off" onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>New passphrase
        <input type="text" value={next} required autoComplete="off" spellCheck={false} placeholder={`At least ${MIN_PASSPHRASE} characters`} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label>Type the new passphrase again
        <input type="text" value={confirm} required autoComplete="off" spellCheck={false} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <button type="button" className="link-act" onClick={suggest}>Suggest a strong one for me</button>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn primary" disabled={busy}>{busy ? "Please wait…" : "Change passphrase"}</button>
    </form>
  );
}

export default function SecuritySettings() {
  const { phase } = useE2ee();
  return (
    <>
      <ChangePassword />
      <span className="setting-title">Encrypted messages</span>
      {phase === "ready" ? <ChangePassphrase /> : <E2eePrompt />}
    </>
  );
}
