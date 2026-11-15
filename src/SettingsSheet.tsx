import { useEffect, useState, type CSSProperties } from "react";
import { HONEY_STYLES, resetAppearance, TEXT_SIZES, useAppearance, type ThemeMode } from "./theme";
import { PHOTO_QUALITY, resetPreferences, usePreferences } from "./preferences";
import { ACTIVITY_SHOWN, useActivityState } from "./activity";
import { ago } from "./notifications";
import { useProfile, useSession } from "./session";
import { personHash, setFriendsAudience, setHoursAudience, setScheduleAudience } from "./profiles";
import { AUDIENCES, VISIBILITY, type Audience } from "./types";
import { BrandName } from "./Logo";
import { TermsContent } from "./Terms";
import { CloseIcon, GlobeIcon, LockIcon, MoonIcon, MonitorIcon, SunIcon, UsersIcon } from "./icons";
import { useScrollLock } from "./scrollLock";
import { RowsSkeleton } from "./Skeleton";

const CATEGORIES = ["Appearance", "Media", "Notifications", "Privacy", "Accessibility", "Activity", "About"] as const;
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
      <fieldset className="setting">
        <legend>Background</legend>
        <div className="honey-grid" role="radiogroup" aria-label="Honeycomb background">
          {HONEY_STYLES.map((h) => (
            <label key={h.id} className={`honey-opt${a.honey === h.id ? " on" : ""}`}>
              <input type="radio" name="honey-style" checked={a.honey === h.id} onChange={() => a.setHoney(h.id)} />
              <span className="honey-sw" data-style={h.id}>{h.id === "off" ? "None" : null}</span>
              {h.label}
            </label>
          ))}
        </div>
        <p className="hint">The honeycomb behind the app. It follows your theme colour.</p>
      </fieldset>
      <Switch label="AMOLED black" hint={dark ? "Pure black backgrounds" : "Dark mode only"}
        checked={a.amoled} disabled={!dark} onChange={a.setAmoled} />
      <div className="setting">
        <label htmlFor="text-size" className="setting-title">Text size: {TEXT_SIZES[a.textSize]}</label>
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
    </>
  );
}

function Media() {
  const p = usePreferences();
  return (
    <Choice name="photo-quality" legend="Photo upload quality" value={p.photo} onChange={p.setPhoto}
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
      <Switch label="Group invitations" hint="Alert when someone invites you"
        checked={p.groupInvites} onChange={p.setGroupInvites} />
      <Switch label="New posts in my groups" hint="Alert for posts in your groups, while VibeBook is open"
        checked={p.groupPosts} onChange={p.setGroupPosts} />
      <fieldset className="setting">
        <legend>Alerts for each group</legend>
        {groups.list.length === 0
          ? <p className="hint">No groups yet.</p>
          : groups.list.map((g) => (
            <Switch key={g.id} label={g.name} hint={p.mutedGroups.includes(g.id) ? "Muted" : "New posts"} disabled={!p.groupPosts}
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
      <Choice name="default-visibility" legend="Who can see new entries" value={p.visibility} onChange={p.setVisibility}
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
    <Switch label="Reduce motion" hint="Turns off animations"
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

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<Category>("Appearance");
  const [armedReset, setArmedReset] = useState(false);

  useScrollLock();
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
          {category === "Notifications" && <Notifications />}
          {category === "Privacy" && <Privacy />}
          {category === "Accessibility" && <Accessibility />}
          {category === "Activity" && <ActivityLog onNavigate={onClose} />}
          {category === "About" && <About />}
        </div>
        </div>
        <div className="settings-foot">
          <button type="button" className={`btn small${armedReset ? " armed" : ""}`} onBlur={() => setArmedReset(false)}
            onClick={() => { if (!armedReset) { setArmedReset(true); return; } setArmedReset(false); resetAppearance(); resetPreferences(); }}>
            {armedReset ? "Tap again to reset" : "Reset settings"}
          </button>
          <p className="hint">Resets this device's settings, including new entry visibility. Friends, hours and schedule privacy stay.</p>
        </div>
      </div>
    </div>
  );
}
