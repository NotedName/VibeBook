import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";
import { authMessage } from "./authErrors";
import { NAME_MAX } from "./profiles";
import { EyeIcon, EyeOffIcon } from "./icons";

const MIN_PASSWORD = 8;

/** 0 = too short, 1 = weak, 2 = okay, 3 = strong. */
function strength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < MIN_PASSWORD) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length >= 12 && kinds >= 3) return 3;
  return kinds >= 3 || pw.length >= 12 ? 2 : 1;
}
const STRENGTH_LABEL = ["Use at least 8 characters", "Weak", "Okay", "Strong"] as const;

type Props = { initialMode?: "signin" | "signup"; onBack?: () => void };

export default function AuthForm({ initialMode = "signin", onBack }: Props) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";
  const level = strength(password);

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setError("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (signup) {
      if (password.length < MIN_PASSWORD) return setError(`Your password needs at least ${MIN_PASSWORD} characters.`);
      if (password !== confirm) return setError("The two passwords do not match.");
    }
    setBusy(true);
    try {
      if (signup) {
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(user, { displayName: name.trim() });
        await sendEmailVerification(user);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(authMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="brand big"><span className="brand-mark" aria-hidden="true">V</span>VibeBook</div>
      <p className="auth-sub">Log what you did, share it with the people and groups you choose, and copy it into your daily report.</p>

      <div className="auth-tabs" role="tablist" aria-label="Sign in or create an account">
        <button type="button" role="tab" aria-selected={!signup} className={!signup ? "on" : ""} onClick={() => switchMode("signin")}>Sign in</button>
        <button type="button" role="tab" aria-selected={signup} className={signup ? "on" : ""} onClick={() => switchMode("signup")}>Create account</button>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <h1>{signup ? "Join VibeBook" : "Welcome back"}</h1>
        {signup && (
          <label>Your name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required
              minLength={2} maxLength={NAME_MAX} placeholder="Juan Dela Cruz" />
          </label>
        )}
        <label>Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required
            placeholder="you@example.com" />
        </label>
        <label>Password
          <span className="pw">
            <input type={show ? "text" : "password"} value={password} required
              minLength={signup ? MIN_PASSWORD : undefined}
              autoComplete={signup ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="icon-btn" aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show} onClick={() => setShow(!show)}>
              {show ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </span>
        </label>
        {signup && (
          <>
            {password && (
              <div className={`meter lvl-${level}`} aria-live="polite">
                <i /><i /><i />
                <span>{STRENGTH_LABEL[level]}</span>
              </div>
            )}
            <label>Confirm password
              <input type={show ? "text" : "password"} value={confirm} required autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)} />
            </label>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="btn primary wide" disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
        {signup && <p className="hint">We will email you a link to confirm your address before you can start.</p>}
      </form>
      {onBack && <button type="button" className="link" onClick={onBack}>← Back to the post</button>}
    </main>
  );
}
