import { useEffect, useState } from "react";
import { TEXT_SIZES, useAppearance, type ThemeMode } from "./theme";
import { PHOTO_QUALITY, usePreferences } from "./preferences";
import { clearActivity, useActivity } from "./activity";
import { ago } from "./notifications";
import { useProfile, useSession } from "./session";
import { VISIBILITY } from "./types";
import { CloseIcon, GlobeIcon, LockIcon, MoonIcon, MonitorIcon, SunIcon, UsersIcon } from "./icons";

const CATEGORIES = ["Appearance", "Media", "Entries", "Accessibility", "Activity"] as const;
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
const SIZE_PX = [12, 14, 17, 20, 24];

function Appearance() {
  const a = useAppearance();
  const dark = a.theme === "dark";
  return (
    <>
      <Choice name="theme-mode" legend="Theme" value={a.mode} options={MODES} onChange={a.setMode}
        hint={a.mode === "system" ? `Follows your device: currently ${a.theme}.` : undefined} />
      <Switch label="AMOLED black" hint={dark ? "Pure black backgrounds" : "Applies in dark mode"}
        checked={a.amoled} disabled={!dark} onChange={a.setAmoled} />
      <Choice name="text-size" legend="Text size" value={a.textSize} className="five" onChange={a.setTextSize}
        options={TEXT_SIZES.map((label, i) => ({
          id: i, label,
          icon: <span className="size-a" style={{ fontSize: `${SIZE_PX[i]}px` }} aria-hidden="true">A</span>,
        }))} />
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

function Accessibility() {
  const p = usePreferences();
  return (
    <Switch label="Reduce motion" hint="Turns off animations. Your device's own setting is always respected too."
      checked={p.reduceMotion} onChange={p.setReduceMotion} />
  );
}

function Person({ uid }: { uid: string }) {
  const p = useProfile(uid);
  return <a href={`#/u/${encodeURIComponent(uid)}`}>{p?.displayName || "someone"}</a>;
}

function ActivityLog({ onNavigate }: { onNavigate: () => void }) {
  const { uid } = useSession();
  const items = useActivity(uid);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  if (items.length === 0) return <p className="hint notes-empty">Nothing yet. What you do in VibeBook, such as entries, comments, reactions and friends, is listed here.</p>;
  return (
    <>
      <p className="hint">Your latest {items.length} actions. Kept on this device only.</p>
      <ul className="activity" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate()}>
        {items.map((it) => (
          <li key={it.id}>
            <span>{it.href ? <a href={it.href}>{it.text}</a> : it.text}{it.who && <> <Person uid={it.who} /></>}</span>
            <time dateTime={new Date(it.at).toISOString()} title={new Date(it.at).toLocaleString()}>{ago(it.at)}</time>
          </li>
        ))}
      </ul>
      <button type="button" className={`btn${armed ? " armed" : ""}`}
        onClick={() => { if (armed) { clearActivity(uid); setArmed(false); } else setArmed(true); }}>
        {armed ? "Tap again to clear the log" : "Clear activity log"}
      </button>
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
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="sheet-head">
          <h2>Settings</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="settings-tabs" role="tablist" aria-label="Settings categories">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={category === c} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
        <div className="sheet-body" role="tabpanel">
          {category === "Appearance" && <Appearance />}
          {category === "Media" && <Media />}
          {category === "Entries" && <Entries />}
          {category === "Accessibility" && <Accessibility />}
          {category === "Activity" && <ActivityLog onNavigate={onClose} />}
        </div>
      </div>
    </div>
  );
}
