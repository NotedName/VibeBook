import { useEffect, useRef, useState, type CSSProperties } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { ACCENTS, HONEY_STYLES, resetAppearance, TEXT_SIZES, useAppearance, type ThemeMode } from "./theme";
import { PHOTO_QUALITY, resetPreferences, usePreferences } from "./preferences";
import { ACTIVITY_SHOWN, useActivityState } from "./activity";
import { ago } from "./notifications";
import { useProfile, useSession } from "./session";
import { personHash, setFriendsAudience, setHoursAudience, setPrivateProfile, setScheduleAudience } from "./profiles";
import { AUDIENCES, VISIBILITY, type Audience } from "./types";
import { BrandName } from "./Logo";
import { TermsContent } from "./Terms";
import { AmoledIcon, CloseIcon, GlobeIcon, LockIcon, MoonIcon, MonitorIcon, SunIcon, UsersIcon } from "./icons";
import { useScrollLock } from "./scrollLock";
import { RowsSkeleton } from "./Skeleton";
import SecuritySettings from "./SecuritySettings";
import { deleteAccount } from "./deleteAccount";
import { authMessage } from "./authErrors";

const CATEGORIES = ["Appearance", "Media", "Notifications", "Privacy", "Security", "Accessibility", "Activity", "About", "Reset"] as const;
type Category = (typeof CATEGORIES)[number];

type Option<T extends string | number> = { id: T; label: string; icon?: React.ReactNode };

/** One choice out of a few, shown as a row of buttons. */
function Choice<T extends string | number>({ name, legend, value, options, onChange, className = "", hint, device = false }: {
  name: string; legend: string; value: T; options: Option<T>[]; onChange: (v: T) => void; className?: string; hint?: string; device?: boolean;
}) {
  return (
    <fieldset className="setting">
      <legend>{legend}{device && <DeviceTag />}</legend>
      <div className={`seg ${className}`}>
        {options.map((o) => (
          <label key={o.id} className={value === o.id ? "on" : ""}>
            <input type="radio" name={name} checked={value === o.id} onChange={() => onChange(o.id)} />
            {o.icon}{o.label}
          </label>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </fieldset>
  );
}

/** Titles in settings are in capitals (styles.css). This marks a setting that is saved on this device only and does not follow you to others. */
function DeviceTag() {
  return <em className="device-tag"> (THIS DEVICE)</em>;
}

/** `device`: only changes this device. `raw`: the title is a name someone chose (a group), so it keeps its own capitals. */
function Switch({ label, hint, checked, disabled = false, device = false, raw = false, onChange }: {
  label: string; hint: string; checked: boolean; disabled?: boolean; device?: boolean; raw?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className={`switch-row${disabled ? " off" : ""}`}>
      <span><b className={`sw-title${raw ? " raw" : ""}`}>{label}{device && <DeviceTag />}</b><small>{hint}</small></span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i className="switch" aria-hidden="true" />
    </label>
  );
}

/** Listed right to left as asked: Light is the right end, System the left end. Take off the .reverse() to run left to right. */
const THEME_SLIDER: Option<ThemeMode>[] = ([
  { id: "light", label: "Light", icon: <SunIcon /> },
  { id: "dark", label: "Dark", icon: <MoonIcon /> },
  { id: "amoled", label: "AMOLED", icon: <AmoledIcon /> },
  { id: "system", label: "System", icon: <MonitorIcon /> },
] as Option<ThemeMode>[]).reverse();

const THEME_HINT: Record<ThemeMode, string> = {
  light: "Light backgrounds.",
  dark: "Dark backgrounds.",
  amoled: "Pure black backgrounds, so the pixels switch off on OLED screens.",
  system: "",
};

/** Theme as a slider: a knob slides to the chosen mode. Tap a mode, drag the knob, or use the arrow keys. */
function ThemeSlider({ value, onChange, hint }: { value: ThemeMode; onChange: (m: ThemeMode) => void; hint: string }) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const index = THEME_SLIDER.findIndex((o) => o.id === value);

  function pick(clientX: number) {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const i = Math.min(THEME_SLIDER.length - 1, Math.max(0, Math.floor(((clientX - box.left) / box.width) * THEME_SLIDER.length)));
    if (THEME_SLIDER[i].id !== value) onChange(THEME_SLIDER[i].id);
  }

  return (
    <fieldset className="setting">
      <legend>Theme<DeviceTag /></legend>
      <div ref={track} className="theme-slider" style={{ "--n": THEME_SLIDER.length, "--i": index } as CSSProperties}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientX); }}
        onPointerMove={(e) => { if (dragging.current) pick(e.clientX); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}>
        <span className="theme-thumb" aria-hidden="true" />
        {THEME_SLIDER.map((o) => (
          <label key={o.id} className={value === o.id ? "on" : ""}>
            <input type="radio" name="theme-mode" checked={value === o.id} onChange={() => onChange(o.id)} />
            {o.icon}{o.label}
          </label>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </fieldset>
  );
}

function Appearance() {
  const a = useAppearance();
  return (
    <>
      <ThemeSlider value={a.mode} onChange={a.setMode}
        hint={a.mode === "system" ? `Follows your device: currently ${a.theme}.` : THEME_HINT[a.mode]} />
      <fieldset className="setting">
        <legend>Accent colour<DeviceTag /></legend>
        <div className="accent-grid" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((c) => (
            <label key={c.id} className={`accent-opt${a.accent === c.id ? " on" : ""}`}>
              <input type="radio" name="accent" checked={a.accent === c.id} onChange={() => a.setAccent(c.id)} />
              <span className="accent-sw" style={{ background: c.color }} />
              {c.label}
            </label>
          ))}
          <label className={`accent-opt${a.accent === "custom" ? " on" : ""}`}>
            <input type="color" className="accent-picker" value={a.customAccent} aria-label="Custom accent colour"
              onChange={(e) => a.setCustomAccent(e.target.value)} />
            <span className={`accent-sw${a.accent === "custom" ? "" : " rainbow"}`}
              style={a.accent === "custom" ? { background: a.customAccent } : undefined} />
            Custom
          </label>
        </div>
        <p className="hint">Buttons, highlights and the honeycomb use this colour.</p>
      </fieldset>
      <fieldset className="setting">
        <legend>Background<DeviceTag /></legend>
        <div className="honey-grid" role="radiogroup" aria-label="Honeycomb background">
          {HONEY_STYLES.map((h) => (
            <label key={h.id} className={`honey-opt${a.honey === h.id ? " on" : ""}`}>
              <input type="radio" name="honey-style" checked={a.honey === h.id} onChange={() => a.setHoney(h.id)} />
              <span className="honey-sw" data-style={h.id}>{h.id === "off" ? "None" : null}</span>
              {h.label}
            </label>
          ))}
        </div>
        <p className="hint">The honeycomb behind the app. It follows your accent colour.</p>
      </fieldset>
      <div className="setting">
        <label htmlFor="text-size" className="setting-title">Text size: {TEXT_SIZES[a.textSize]}<DeviceTag /></label>
        <div className="size-slider">
          <span className="size-a small" aria-hidden="true">A</span>
          <div className="size-track">
            <input id="text-size" type="range" min={0} max={TEXT_SIZES.length - 1} step={1} value={a.textSize}
              style={{ "--f": a.textSize / (TEXT_SIZES.length - 1) } as CSSProperties}
              aria-valuetext={TEXT_SIZES[a.textSize]} onChange={(e) => a.setTextSize(Number(e.target.value))} />
            <div className="size-ticks" aria-hidden="true">{TEXT_SIZES.map((s, i) => <i key={s} className={i <= a.textSize ? "on" : ""} />)}</div>
          </div>
          <span className="size-a large" aria-hidden="true">A</span>
        </div>
        <p className="size-preview">The quick brown fox jumps over the lazy dog.</p>
      </div>
      <Switch device label="Bold text" hint="Makes all text heavier and easier to read"
        checked={a.bold} onChange={a.setBold} />
      <Switch device label="High contrast" hint="Stronger text, borders and highlights"
        checked={a.contrast} onChange={a.setContrast} />
      <Switch device label="Underline links" hint="Underlines tappable text links so they stand out"
        checked={a.underlineLinks} onChange={a.setUnderlineLinks} />
      <Switch device label="Square corners" hint="Sharper corners on cards, buttons and fields"
        checked={a.squareCorners} onChange={a.setSquareCorners} />
    </>
  );
}

function Media() {
  const p = usePreferences();
  return (
    <Choice device name="photo-quality" legend="Photo upload quality" value={p.photo} onChange={p.setPhoto}
      options={PHOTO_QUALITY.map((q) => ({ id: q.id, label: q.label }))}
      hint={`${PHOTO_QUALITY.find((q) => q.id === p.photo)!.hint} New photos only.`} />
  );
}

const VIS_ICON = { private: <LockIcon />, friends: <UsersIcon />, public: <GlobeIcon /> };

function Notifications() {
  const p = usePreferences();
  const { groups } = useSession();
  return (
    <>
      <span className="setting-title">Groups</span>
      <Switch device label="Group invitations" hint="Alert when someone invites you"
        checked={p.groupInvites} onChange={p.setGroupInvites} />
      <Switch device label="New posts in my groups" hint="Alert for posts in your groups, while VibeBook is open"
        checked={p.groupPosts} onChange={p.setGroupPosts} />
      <fieldset className="setting">
        <legend>Alerts for each group<DeviceTag /></legend>
        {groups.list.length === 0
          ? <p className="hint">No groups yet.</p>
          : groups.list.map((g) => (
            <Switch key={g.id} raw label={g.name} hint={p.mutedGroups.includes(g.id) ? "Muted" : "New posts"} disabled={!p.groupPosts}
              checked={p.groupPosts && !p.mutedGroups.includes(g.id)} onChange={(on) => p.setGroupMuted(g.id, !on)} />
          ))}
      </fieldset>
    </>
  );
}

const FRIENDS_HINT: Record<Audience, string> = {
  private: "Only you can see your friends.",
  friends: "Only your friends can see your friends.",
  fof: "Friends and their friends can see them.",
  everyone: "Anyone signed in can see them.",
};
const HOURS_HINT: Record<Audience, string> = {
  private: "Hidden from others.",
  friends: "Shows hours logged and required. Entries and times stay private.",
  fof: "Shows hours logged and required. Entries and times stay private.",
  everyone: "Shows hours logged and required. Entries and times stay private.",
};
const SCHEDULE_HINT: Record<Audience, string> = {
  private: "Hidden from others.",
  friends: "Shows your work days and hours a day. Days off stay private.",
  fof: "Shows your work days and hours a day. Days off stay private.",
  everyone: "Shows your work days and hours a day. Days off stay private.",
};

function Privacy() {
  const { me, uid, notify } = useSession();
  const p = usePreferences();
  const save = (job: Promise<void>) => { job.catch(() => notify("Could not save that. Try again.")); };
  if (!me) return null;
  return (
    <>
      <Switch label="Private profile" checked={me.privateProfile}
        hint="Only friends see your entries, hours, schedule and friends. Everyone else sees your name and photo and can send a friend request."
        onChange={(on) => save(setPrivateProfile(uid, on))} />
      <Choice device name="default-visibility" legend="Who can see new entries" value={p.visibility} onChange={p.setVisibility}
        options={VISIBILITY.map((v) => ({ id: v.id, label: v.label, icon: VIS_ICON[v.id] }))}
        hint={`${VISIBILITY.find((v) => v.id === p.visibility)!.hint} Change one entry from its ⋯ menu.`} />
      <Choice name="friends-audience" legend="Who can see my friends" value={me.friendsAudience} options={AUDIENCES} className="four"
        hint={FRIENDS_HINT[me.friendsAudience]} onChange={(a) => save(setFriendsAudience(uid, a))} />
      <Choice name="hours-audience" legend="Who can see my hours" value={me.hoursAudience} options={AUDIENCES} className="four"
        hint={HOURS_HINT[me.hoursAudience]} onChange={(a) => save(setHoursAudience(uid, a))} />
      <Choice name="schedule-audience" legend="Who can see my schedule" value={me.scheduleAudience} options={AUDIENCES} className="four"
        hint={SCHEDULE_HINT[me.scheduleAudience]} onChange={(a) => save(setScheduleAudience(uid, a))} />
    </>
  );
}

function Accessibility() {
  const p = usePreferences();
  return (
    <Switch device label="Reduce motion" hint="Turns off animations"
      checked={p.reduceMotion} onChange={p.setReduceMotion} />
  );
}

function About() {
  return (
    <>
      <div className="about-brand brand"><BrandName /></div>
      <p>VibeBook keeps your OJT entries: log what you did each day and look back on it any time.</p>
      <ul className="about-list">
        <li>Daily entries with photos, skills and a description.</li>
        <li>Copy an entry straight into your daily report.</li>
        <li>Share with only you, friends, the public or groups.</li>
      </ul>
      <p className="hint">Entries, photos and profile are saved to your account. Display settings are saved per device.</p>
      <details className="about-terms">
        <summary>Terms and Conditions</summary>
        <TermsContent />
      </details>
    </>
  );
}

function Person({ uid }: { uid: string }) {
  const p = useProfile(uid);
  return <a href={personHash(uid, p)}>{p?.displayName || "someone"}</a>;
}

function ActivityLog({ onNavigate }: { onNavigate: () => void }) {
  const { uid } = useSession();
  const { items, ready } = useActivityState(uid);

  if (!ready && items.length === 0) return <RowsSkeleton />;
  if (items.length === 0) return <p className="hint notes-empty">Nothing yet. Your actions will show up here.</p>;
  return (
    <>
      <p className="hint">{items.length >= ACTIVITY_SHOWN ? `Your latest ${ACTIVITY_SHOWN} actions` : `${items.length} ${items.length === 1 ? "action" : "actions"}`}. Saved to your account; it cannot be cleared.</p>
      <ul className="activity" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate()}>
        {items.map((it) => (
          <li key={it.id}>
            <span>{it.href ? <a href={it.href}>{it.text}</a> : it.text}{it.who && <> <Person uid={it.who} /></>}</span>
            <time dateTime={new Date(it.at).toISOString()} title={new Date(it.at).toLocaleString()}>{ago(it.at)}</time>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Settings > Reset: one plain button. Pressing it asks first, and the dialog is where the warning is spelled out. */
function Reset({ onAsk }: { onAsk: () => void }) {
  return (
    <>
      <button type="button" className="btn" onClick={onAsk}>Reset</button>
      <DeleteAccount />
    </>
  );
}

/** Settings > Reset > Delete account: the password, then a dialog that asks for the word "delete" before anything is removed. */
function DeleteAccount() {
  const { user } = useSession();
  const [password, setPassword] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!user.providerData.some((p) => p.providerId === "password")) {
    return <p className="hint">You sign in with Google, so this account cannot be deleted with a password here.</p>;
  }

  async function run() {
    setAsking(false);
    setBusy(true);
    setError("");
    try {
      await deleteAccount(user, password);
    } catch (err) {
      setError(authMessage(err));
      setBusy(false);
    }
  }

  return (
    <section className="deactivate-section" aria-label="Delete account">
      <h3>Delete account</h3>
      <p className="hint">Permanently deletes your account, entries, photos and profile. This cannot be undone.</p>
      <label>Password
        <input type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" className="btn danger" disabled={busy || !password} onClick={() => setAsking(true)}>{busy ? "Deleting…" : "Delete my account"}</button>
      {asking && (
        <ConfirmDialog title="Delete your account?" confirmLabel="Delete forever" danger typeToConfirm="delete" onCancel={() => setAsking(false)} onConfirm={run}>
          <p>Your entries, photos, comments, friendships and profile are deleted and your username is released. Chats you had and group posts may remain.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<Category>("Appearance");
  const [askReset, setAskReset] = useState(false);

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet settings-sheet" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="sheet-head">
          <h2>Settings</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="settings-layout">
        <div className="settings-nav" role="tablist" aria-label="Settings categories" aria-orientation="vertical">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={category === c} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
        <div className="sheet-body" role="tabpanel">
          {category === "Appearance" && <Appearance />}
          {category === "Media" && <Media />}
          {category === "Notifications" && <Notifications />}
          {category === "Privacy" && <Privacy />}
          {category === "Security" && <SecuritySettings />}
          {category === "Accessibility" && <Accessibility />}
          {category === "Activity" && <ActivityLog onNavigate={onClose} />}
          {category === "About" && <About />}
          {category === "Reset" && <Reset onAsk={() => setAskReset(true)} />}
        </div>
        </div>
      </div>
    </div>
    {askReset && (
      <ConfirmDialog title="Reset settings?" confirmLabel="Reset" danger onCancel={() => setAskReset(false)}
        onConfirm={() => { setAskReset(false); resetAppearance(); resetPreferences(); }}>
        <p>This resets this device's settings, including new entry visibility. Your friends, hours and schedule privacy stay as they are.</p>
      </ConfirmDialog>
    )}
    </>
  );
}
