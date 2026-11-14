import { useEffect, useState } from "react";
import { TEXT_SIZES, useAppearance, type ThemeMode } from "./theme";
import { PHOTO_QUALITY, usePreferences } from "./preferences";
import { useActivity } from "./activity";
import { ago } from "./notifications";
import { useProfile, useSession } from "./session";
import { personHash } from "./profiles";
import { VISIBILITY } from "./types";
import { BrandName } from "./Logo";
import { CloseIcon, GlobeIcon, LockIcon, MoonIcon, MonitorIcon, SunIcon, UsersIcon } from "./icons";

const CATEGORIES = ["Appearance", "Media", "Entries", "Notifications", "Accessibility", "Activity", "About"] as const;
type Category = (typeof CATEGORIES)[number];

type Option<T extends string | number> = { id: T; label: string; icon?: React.ReactNode };

/** One choice out of a few, shown as a row of buttons. */
function Choice<T extends string | number>({ name, legend, value, options, onChange, className = "", hint }: {
  name: string; legend: string; value: T; options: Option<T>[]; onChange: (v: T) => void; className?: string; hint?: string;
}) {
  return (
    <fieldset className="setting">
      <legend>{legend}</legend>
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

function Switch({ label, hint, checked, disabled = false, onChange }: {
  label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className={`switch-row${disabled ? " off" : ""}`}>
      <span>{label}<small>{hint}</small></span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i className="switch" aria-hidden="true" />
    </label>
  );
}

const MODES: Option<ThemeMode>[] = [
  { id: "light", label: "Light", icon: <SunIcon /> },
  { id: "dark", label: "Dark", icon: <MoonIcon /> },
  { id: "system", label: "System", icon: <MonitorIcon /> },
];

function Appearance() {
  const a = useAppearance();
  const dark = a.theme === "dark";
  return (
    <>
      <Choice name="theme-mode" legend="Theme" value={a.mode} options={MODES} onChange={a.setMode}
        hint={a.mode === "system" ? `Follows your device: currently ${a.theme}.` : undefined} />
      <Switch label="AMOLED black" hint={dark ? "Pure black backgrounds" : "Applies in dark mode"}
        checked={a.amoled} disabled={!dark} onChange={a.setAmoled} />
      <div className="setting">
        <label htmlFor="text-size" className="setting-title">Text size: {TEXT_SIZES[a.textSize]}</label>
        <div className="size-slider">
          <span className="size-a small" aria-hidden="true">A</span>
          <input id="text-size" type="range" min={0} max={TEXT_SIZES.length - 1} step={1} value={a.textSize}
            aria-valuetext={TEXT_SIZES[a.textSize]} onChange={(e) => a.setTextSize(Number(e.target.value))} />
          <span className="size-a large" aria-hidden="true">A</span>
        </div>
        <div className="size-ticks" aria-hidden="true">{TEXT_SIZES.map((s) => <i key={s} />)}</div>
        <p className="size-preview">The quick brown fox jumps over the lazy dog.</p>
      </div>
    </>
  );
}

function Media() {
  const p = usePreferences();
  return (
    <Choice name="photo-quality" legend="Photo upload quality" value={p.photo} onChange={p.setPhoto}
      options={PHOTO_QUALITY.map((q) => ({ id: q.id, label: q.label }))}
      hint={`${PHOTO_QUALITY.find((q) => q.id === p.photo)!.hint} Applies to photos you add from now on.`} />
  );
}

const VIS_ICON = { private: <LockIcon />, friends: <UsersIcon />, public: <GlobeIcon /> };

function Entries() {
  const p = usePreferences();
  return (
    <Choice name="default-visibility" legend="Who can see new entries" value={p.visibility} onChange={p.setVisibility}
      options={VISIBILITY.map((v) => ({ id: v.id, label: v.label, icon: VIS_ICON[v.id] }))}
      hint={`${VISIBILITY.find((v) => v.id === p.visibility)!.hint} You can still change it on each entry.`} />
  );
}

function Notifications() {
  const p = usePreferences();
  const { groups } = useSession();
  return (
    <>
      <span className="setting-title">Groups</span>
      <Switch label="Group invitations" hint="Show an alert in the bell when someone invites you to a group"
        checked={p.groupInvites} onChange={p.setGroupInvites} />
      <Switch label="New posts in my groups" hint="Show an alert in the bell when someone posts in a group you are in. Alerts appear while VibeBook is open."
        checked={p.groupPosts} onChange={p.setGroupPosts} />
      <fieldset className="setting">
        <legend>Alerts for each group</legend>
        {groups.list.length === 0
          ? <p className="hint">Join a group to choose alerts for it.</p>
          : groups.list.map((g) => (
            <Switch key={g.id} label={g.name} hint={p.mutedGroups.includes(g.id) ? "Muted" : "New posts"} disabled={!p.groupPosts}
              checked={p.groupPosts && !p.mutedGroups.includes(g.id)} onChange={(on) => p.setGroupMuted(g.id, !on)} />
          ))}
      </fieldset>
    </>
  );
}

function Accessibility() {
  const p = usePreferences();
  return (
    <Switch label="Reduce motion" hint="Turns off animations. Your device's own setting is always respected too."
      checked={p.reduceMotion} onChange={p.setReduceMotion} />
  );
}

function About() {
  return (
    <>
      <div className="about-brand brand"><BrandName /></div>
      <p>VibeBook is a logbook for what you did each day. Write an entry with photos, the skills you picked up and a short description, then copy it straight into your daily report.</p>
      <ul className="about-list">
        <li>Choose who sees each entry: only you, your friends, or the public.</li>
        <li>Add friends or follow people, and share entries in groups.</li>
        <li>Comment, reply, vibe, and repost entries you like.</li>
      </ul>
      <p className="hint">Your settings and activity log are saved on this device. Entries, photos and profiles are stored in your VibeBook account with Firebase.</p>
    </>
  );
}

function Person({ uid }: { uid: string }) {
  const p = useProfile(uid);
  return <a href={personHash(uid, p)}>{p?.displayName || "someone"}</a>;
}

function ActivityLog({ onNavigate }: { onNavigate: () => void }) {
  const { uid } = useSession();
  const items = useActivity(uid);

  if (items.length === 0) return <p className="hint notes-empty">Nothing yet. What you do in VibeBook, such as entries, comments, reactions and friends, is listed here.</p>;
  return (
    <>
      <p className="hint">{items.length} {items.length === 1 ? "action" : "actions"} logged. Kept on this device; the log cannot be deleted or cleared.</p>
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

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<Category>("Appearance");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
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
          {category === "Entries" && <Entries />}
          {category === "Notifications" && <Notifications />}
          {category === "Accessibility" && <Accessibility />}
          {category === "Activity" && <ActivityLog onNavigate={onClose} />}
          {category === "About" && <About />}
        </div>
        </div>
      </div>
    </div>
  );
}
