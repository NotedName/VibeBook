import { useEffect, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";
import { authMessage } from "./authErrors";
import { NAME_MAX, isUsernameAvailable, normalizeUsername, rememberPendingUsername, suggestUsername, usernameProblem } from "./profiles";
import UsernameField from "./UsernameField";
import { CopyIcon, EyeIcon, EyeOffIcon, GroupsIcon, NoteIcon } from "./icons";
import { BrandName } from "./Logo";
import { TermsDialog } from "./Terms";
import ForgotPasswordForm from "./ForgotPasswordForm";
import { MIN_PASSWORD, STRENGTH_LABEL, strength } from "./password";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = "name" | "email" | "password" | "confirm" | "terms";

/** Skill chips that float beside the sign-in form; the classes place each one (see .fx-chip in layout.css). */
const FX_CHIPS: [string, string][] = [
  ["React", "c1"], ["Writing", "c2"], ["Figma", "c3"], ["Public speaking", "c4"], ["SQL", "c5"], ["Photography", "c6"],
];

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
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const signup = mode === "signup";
  const level = strength(password);

  // Say so before they fill everything in, not after the request fails.
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  /** What is wrong with each field right now. "" = fine. Shown as soon as someone leaves the field (or on submit), not only after the server says no. */
  const problems: Record<Field, string> = {
    name: signup && name.trim().length < 2 ? "Enter your name (at least 2 characters)." : "",
    email: !email.trim() ? "Enter your email address." : !EMAIL_RE.test(email.trim()) ? "That email address does not look right. It should look like you@example.com." : "",
    password: !password ? "Enter your password." : signup && password.length < MIN_PASSWORD ? `Your password needs at least ${MIN_PASSWORD} characters.` : "",
    confirm: !signup ? "" : !confirm ? "Type your password again to confirm it." : confirm !== password ? "The two passwords do not match." : "",
    terms: signup && !agreed ? "You need to agree to the Terms and Conditions to create an account." : "",
  };
  const touch = (f: Field) => setTouched((t) => (t[f] ? t : { ...t, [f]: true }));
  const shown = (f: Field) => ((touched[f] || submitted) ? problems[f] : "");
  // Passwords are compared while the second one is being typed, once it is as long as the first.
  const confirmLive = signup && confirm.length > 0 && confirm.length >= password.length && confirm !== password ? problems.confirm : "";
  const confirmError = shown("confirm") || confirmLive;
  const invalidProps = (f: Field, message: string) => ({
    "aria-invalid": message ? true : undefined,
    "aria-describedby": message ? `err-${f}` : undefined,
    onBlur: () => touch(f),
  });
  const fieldError = (f: Field, message: string) =>
    message ? <small id={`err-${f}`} className="field-error" role="alert">{message}</small> : null;

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setError("");
    setTouched({});
    setSubmitted(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitted(true);
    const handle = normalizeUsername(username);
    if (!online) return setError("You are offline. Connect to the internet and try again.");
    if (problems.email || problems.password || (signup && (problems.name || problems.confirm || problems.terms))) return;
    if (signup) {
      const problem = usernameProblem(handle);
      if (problem) return setError(problem);
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
        {forgot ? <ForgotPasswordForm initialEmail={email} onBack={() => setForgot(false)} /> : <>
        <div className="auth-tabs" role="tablist" aria-label="Sign in or create an account">
          <button type="button" role="tab" aria-selected={!signup} className={!signup ? "on" : ""} onClick={() => switchMode("signin")}>Sign in</button>
          <button type="button" role="tab" aria-selected={signup} className={signup ? "on" : ""} onClick={() => switchMode("signup")}>Create account</button>
        </div>

        <form className="auth-card" onSubmit={submit} noValidate>
          <h1>{signup ? "Join VibeBook" : "Welcome back"}</h1>
          {signup && (
            <label>Your name
              <input value={name} autoComplete="name" required
                maxLength={NAME_MAX} placeholder="e.g. Juan Dela Cruz"
                {...invalidProps("name", shown("name"))}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!usernameTouched) setUsername(suggestUsername(e.target.value)); // follows the name until they type their own
                }} />
              {fieldError("name", shown("name"))}
            </label>
          )}
          {signup && (
            <UsernameField value={username} onChange={(v) => { setUsername(v); setUsernameTouched(true); }} />
          )}
          <label>Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required
              placeholder="name@example.com" {...invalidProps("email", shown("email"))} />
            {fieldError("email", shown("email"))}
          </label>
          <label>Password
            <span className="pw">
              <input type={show ? "text" : "password"} value={password} required
                autoComplete={signup ? "new-password" : "current-password"}
                placeholder={signup ? `At least ${MIN_PASSWORD} characters` : "Your password"}
                {...invalidProps("password", shown("password"))}
                onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="icon-btn" aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show} onClick={() => setShow(!show)}>
                {show ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </span>
            {fieldError("password", shown("password"))}
          </label>
          {!signup && <button type="button" className="link inline forgot-link" onClick={() => setForgot(true)}>Forgot password?</button>}
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
                  placeholder="Type the same password again"
                  {...invalidProps("confirm", confirmError)}
                  onChange={(e) => setConfirm(e.target.value)} />
                {fieldError("confirm", confirmError)}
              </label>
              <div className="terms-check">
                <label className="check">
                  <input type="checkbox" checked={agreed} {...invalidProps("terms", shown("terms"))}
                    onChange={(e) => { setAgreed(e.target.checked); touch("terms"); }} />
                  <span>I have read and agree to the{" "}
                    <button type="button" className="link inline" onClick={() => setShowTerms(true)}>Terms and Conditions</button>.
                  </span>
                </label>
                {fieldError("terms", shown("terms"))}
              </div>
            </>
          )}
          {!online && <p className="error" role="alert">You are offline. Connect to the internet to {signup ? "create your account" : "sign in"}.</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="btn primary wide" disabled={busy}>
            {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
          </button>
          {signup && <p className="hint">We will email you a link to confirm your address. Your username is reserved once you confirm.</p>}
        </form>
        {onBack && <button type="button" className="btn" onClick={onBack}>← Back to the post</button>}
        </>}
      </div>
      {showTerms && <TermsDialog onClose={() => setShowTerms(false)} />}
    </main>
  );
}
