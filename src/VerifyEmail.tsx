import { useCallback, useEffect, useState } from "react";
import { sendEmailVerification, signOut, type User } from "firebase/auth";
import { auth } from "./firebase";
import { authMessage } from "./authErrors";
import { MailIcon } from "./icons";

const RESEND_SECONDS = 30;

type Props = { user: User; onVerified: () => void };

/** Shown to anyone signed in with an email that is not verified yet. */
export default function VerifyEmail({ user, onVerified }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const check = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await user.reload();
      if (user.emailVerified) {
        await user.getIdToken(true); // the Firestore rules read email_verified from this token
        onVerified();
      } else {
        setMessage("Not verified yet. Open the link in the email, then try again.");
      }
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }, [user, onVerified]);

  // Coming back from the email tab checks again, so most people never press the button.
  useEffect(() => {
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [check]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sendEmailVerification(user);
      setMessage("Sent. It can take a minute to arrive.");
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="brand big"><span className="brand-mark" aria-hidden="true">V</span>VibeBook</div>
      <section className="auth-card verify">
        <div className="verify-icon"><MailIcon /></div>
        <h1>Verify your email</h1>
        <p>
          We sent a link to <b>{user.email}</b>. Open it to confirm this is your address, then come back here.
        </p>
        <p className="hint">Nothing in your inbox? Check spam or promotions.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="ok" role="status">{message}</p>}
        <button type="button" className="btn primary wide" disabled={busy} onClick={check}>I have verified</button>
        <button type="button" className="btn wide" disabled={busy || cooldown > 0} onClick={resend}>
          {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}
        </button>
      </section>
      <button type="button" className="link" onClick={() => signOut(auth)}>Use a different account</button>
    </main>
  );
}
