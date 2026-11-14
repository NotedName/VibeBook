import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";
import { authMessage } from "./authErrors";
import { NAME_MAX, isUsernameAvailable, normalizeUsername, rememberPendingUsername, suggestUsername, usernameProblem } from "./profiles";
import UsernameField from "./UsernameField";
import { CopyIcon, EyeIcon, EyeOffIcon, GroupsIcon, NoteIcon } from "./icons";
import { BrandName } from "./Logo";

const MIN_PASSWORD = 8;

/** Skill chips that float beside the sign-in form; the classes place each one (see .fx-chip in layout.css). */
const FX_CHIPS: [string, string][] = [
  ["React", "c1"], ["Writing", "c2"], ["Figma", "c3"], ["Public speaking", "c4"], ["SQL", "c5"], ["Photography", "c6"],
];

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
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
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
    const handle = normalizeUsername(username);
    if (signup) {
      const problem = usernameProblem(handle);
      if (problem) return setError(problem);
      if (password.length < MIN_PASSWORD) return setError(`Your password needs at least ${MIN_PASSWORD} characters.`);
      if (password !== confirm) return setError("The two passwords do not match.");
    }
    setBusy(true);
    try {
      if (signup) {
        if (!(await isUsernameAvailable(handle))) {
          setError(`@${handle} is already taken. Try another username.`);
          setBusy(false);
          return;
        }
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(user, { displayName: name.trim() });
        // The name is reserved after the email is verified (profile setup). Until then it is only remembered here;
        // if someone else takes it first, profile setup asks for another one.
        rememberPendingUsername(user.uid, handle);
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
    <main className="auth split">
      {/* Decorative only: drifting glows, a faint grid and floating skill chips down the sides. */}
      <div className="auth-fx" aria-hidden="true">
        <i className="fx-orb o1" /><i className="fx-orb o2" /><i className="fx-orb o3" /><i className="fx-grid" />
        {FX_CHIPS.map(([label, cls]) => <span key={label} className={`fx-chip ${cls}`}>{label}</span>)}
      </div>

      <section className="auth-hero">
        <div className="brand big"><BrandName /></div>
        <p className="auth-sub">Log what you did, share it with the people and groups you choose, and copy it into your daily report.</p>
        <ul className="auth-points">
          <li><i><NoteIcon /></i><span><b>Log your day</b>A photo, the skills you picked up and a short description.</span></li>
          <li><i><GroupsIcon /></i><span><b>Share on your terms</b>Keep it private, or share with friends, groups or everyone.</span></li>
          <li><i><CopyIcon /></i><span><b>Report in one tap</b>Copy a finished daily report instead of rewriting your day.</span></li>
        </ul>
      </section>

      <div className="auth-panel">
        <div className="auth-tabs" role="tablist" aria-label="Sign in or create an account">
          <button type="button" role="tab" aria-selected={!signup} className={!signup ? "on" : ""} onClick={() => switchMode("signin")}>Sign in</button>
          <button type="button" role="tab" aria-selected={signup} className={signup ? "on" : ""} onClick={() => switchMode("signup")}>Create account</button>
        </div>

        <form className="auth-card" onSubmit={submit}>
          <h1>{signup ? "Join VibeBook" : "Welcome back"}</h1>
          {signup && (
            <label>Your name
              <input value={name} autoComplete="name" required
                minLength={2} maxLength={NAME_MAX} placeholder="Juan Dela Cruz"
                onChange={(e) => {
                  setName(e.target.value);
                  if (!usernameTouched) setUsername(suggestUsername(e.target.value)); // follows the name until they type their own
                }} />
            </label>
          )}
          {signup && (
            <UsernameField value={username} onChange={(v) => { setUsername(v); setUsernameTouched(true); }} />
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
          {signup && <p className="hint">We will email you a link to confirm your address before you can start. Your username is reserved once you confirm.</p>}
        </form>
        {onBack && <button type="button" className="btn" onClick={onBack}>← Back to the post</button>}
      </div>
    </main>
  );
}
