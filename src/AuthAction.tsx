import { useEffect, useRef, useState, type FormEvent } from "react";
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "./firebase";
import { authMessage } from "./authErrors";
import { BrandName } from "./Logo";
import NewPasswordFields from "./NewPasswordFields";
import { newPasswordProblem } from "./password";

/**
 * Where the links in Firebase's emails land (set the "action URL" of the email templates to this site, see README).
 * Firebase's own page asks for a new password once; this one asks twice.
 */
export type ActionLink = { mode: string; code: string };

export function readActionLink(): ActionLink | null {
  const p = new URLSearchParams(location.search);
  const mode = p.get("mode");
  const code = p.get("oobCode");
  return mode && code ? { mode, code } : null;
}

type Props = { link: ActionLink; onDone: () => void };

function ResetPassword({ code, onDone }: { code: string; onDone: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const checked = useRef(false);

  // The link is checked once, as soon as the page opens, so an expired or used link is reported before anything is typed.
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    verifyPasswordResetCode(auth, code).then(setEmail, (err) => setError(authMessage(err)));
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = newPasswordProblem(password, confirm);
    if (problem) return setError(problem);
    setError("");
    setBusy(true);
    try {
      await confirmPasswordReset(auth, code, password);
      setSaved(true);
    } catch (err) {
      setError(authMessage(err));
    }
    setBusy(false);
  }

  if (saved) {
    return (
      <form className="auth-card">
        <h1>Password changed</h1>
        <p className="hint" role="status">You can now sign in with your new password.</p>
        <button type="button" className="btn primary wide" onClick={onDone}>Go to sign in</button>
      </form>
    );
  }
  if (email === null) {
    return (
      <div className="auth-card">
        <h1>Reset your password</h1>
        {error
          ? <><p className="error" role="alert">{error}</p><button type="button" className="btn primary wide" onClick={onDone}>Back to sign in</button></>
          : <p className="hint">Checking your link…</p>}
      </div>
    );
  }
  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <h1>Choose a new password</h1>
      <p className="hint">For {email}</p>
      <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn primary wide" disabled={busy}>{busy ? "Please wait…" : "Change password"}</button>
    </form>
  );
}

function VerifyEmailLink({ code, onDone }: { code: string; onDone: () => void }) {
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    applyActionCode(auth, code)
      .then(() => auth.currentUser?.reload())
      .then(() => setVerified(true), (err) => setError(authMessage(err)));
  }, [code]);

  return (
    <div className="auth-card">
      <h1>{verified ? "Email confirmed" : "Confirm your email"}</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {!error && !verified && <p className="hint">Confirming your email…</p>}
      {verified && <p className="hint" role="status">Thank you. Your email address is confirmed.</p>}
      {(error || verified) && <button type="button" className="btn primary wide" onClick={onDone}>Continue</button>}
    </div>
  );
}

export default function AuthAction({ link, onDone }: Props) {
  return (
    <main className="auth">
      <div className="auth-panel">
        <div className="brand big"><BrandName /></div>
        {link.mode === "resetPassword" && <ResetPassword code={link.code} onDone={onDone} />}
        {link.mode === "verifyEmail" && <VerifyEmailLink code={link.code} onDone={onDone} />}
        {link.mode !== "resetPassword" && link.mode !== "verifyEmail" && (
          <div className="auth-card">
            <h1>Link not supported</h1>
            <p className="hint">This link cannot be opened here.</p>
            <button type="button" className="btn primary wide" onClick={onDone}>Back to VibeBook</button>
          </div>
        )}
      </div>
    </main>
  );
}
