import { useState, type FormEvent } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "./firebase";
import { authMessage } from "./authErrors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Forgot password?" on the sign-in screen: emails a reset link. The answer is the same whether or not an account exists. */
export default function ForgotPasswordForm({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const address = email.trim();
    if (!EMAIL_RE.test(address)) return setError("Enter the email address of your account.");
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, address);
      setSentTo(address);
    } catch (err) {
      setError(authMessage(err));
    }
    setBusy(false);
  }

  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <h1>Reset your password</h1>
      {sentTo ? (
        <>
          <p className="hint" role="status">If an account exists for <b>{sentTo}</b>, we sent a link to choose a new password. Check your spam folder if it does not arrive.</p>
          <button type="button" className="btn primary wide" onClick={onBack}>Back to sign in</button>
        </>
      ) : (
        <>
          <p className="hint">Enter your email and we will send you a link to choose a new password.</p>
          <label>Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required
              placeholder="name@example.com" autoFocus />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="btn primary wide" disabled={busy}>{busy ? "Please wait…" : "Send reset link"}</button>
          <button type="button" className="btn wide" onClick={onBack}>Back to sign in</button>
        </>
      )}
    </form>
  );
}
