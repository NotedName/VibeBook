import { useEffect, useRef, useState, type CSSProperties } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { ACCENTS, HONEY_STYLES, resetAppearance, TEXT_SIZES, useAppearance, type ThemeMode } from "./theme";
import { buildPhotoZip } from "./photoExport";
import { PHOTO_QUALITY, resetPreferences, START_PAGES, usePreferences } from "./preferences";
import { ACTIVITY_SHOWN, useActivityState } from "./activity";
import { ago } from "./notifications";
import { useProfile, useSession } from "./session";
import { deactivateAccount, personHash, setActiveStatus, setFriendsAudience, setHoursAudience, setPrivateProfile, setScheduleAudience, setStatusAudience } from "./profiles";
import { AUDIENCES, VISIBILITY, type Audience } from "./types";
import { BrandName } from "./Logo";
import { TermsContent } from "./Terms";
import {
  AmoledIcon, ArchiveIcon, CheckIcon, CloseIcon, DatabaseIcon, DownloadIcon, EyeOffIcon, GlobeIcon, InfoIcon, LockIcon, LogOutIcon, MoonIcon, MonitorIcon,
  PaletteIcon, SettingsIcon, ShieldIcon, SunIcon, ToggleIcon, TrashIcon, UploadIcon, UsersIcon,
} from "./icons";
import { useScrollLock } from "./scrollLock";
import { RowsSkeleton } from "./Skeleton";
import SecuritySettings from "./SecuritySettings";
import { deleteAccount } from "./deleteAccount";
import { authMessage } from "./authErrors";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { saveFile } from "./download";
import { buildBackup, parseBackup, restoreBackup, type BackupFile } from "./backup";

/** Closely related settings share a tab: colours and text (Appearance); photos, notifications and motion (Preferences); who sees what and how you sign in (Privacy & security). */
const CATEGORIES = [
  { id: "appearance", label: "Appearance", icon: <PaletteIcon /> },
  { id: "preferences", label: "Preferences", icon: <ToggleIcon /> },
  { id: "privacy", label: "Privacy & security", icon: <ShieldIcon /> },
  { id: "data", label: "Data & account", icon: <DatabaseIcon /> },
  { id: "about", label: "About", icon: <InfoIcon /> },
] as const;
type Category = (typeof CATEGORIES)[number]["id"];

/** A titled group inside a tab, like BACKUP and ACCOUNT. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="set-section"><h3>{title}</h3>{children}</section>;
}

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

function EntrySuggestionsSetting() {
  const p = usePreferences();
  return <Switch device label="Suggestions" checked={p.entrySuggestions} onChange={p.setEntrySuggestions}
    hint="When writing a new entry, show your 5 most recent activities and skills to tap and reuse." />;
}

function StartPageSetting() {
  const p = usePreferences();
  return (
    <Choice device name="start-page" legend="Open the app on" value={p.startPage} onChange={p.setStartPage} className="four"
      options={START_PAGES.map((x) => ({ id: x.id, label: x.label }))}
      hint="Where VibeBook opens when you launch it. Links to a specific page still go there." />
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

const STATUS_HINT: Record<Audience, string> = {
  private: "Hidden from others.",
  friends: "Shows that you are clocked in or on a break, and when you resume. Only while the clock is running.",
  fof: "Shows that you are clocked in or on a break, and when you resume. Only while the clock is running.",
  everyone: "Shows that you are clocked in or on a break, and when you resume. Only while the clock is running.",
};

function Privacy() {
  const { me, uid, notify } = useSession();
  const p = usePreferences();
  const save = (job: Promise<void>) => { job.catch(() => notify("Could not save that. Try again.")); };
  if (!me) return null;
  return (
    <>
      <Switch label="Active status" checked={me.activeStatus}
        hint="Show friends and people you message when you're active or recently active. You won't see their active status while this is turned off."
        onChange={(on) => save(setActiveStatus(uid, on))} />
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
      <Choice name="status-audience" legend="Who can see when I'm clocked in" value={me.statusAudience} options={AUDIENCES} className="four"
        hint={STATUS_HINT[me.statusAudience]} onChange={(a) => save(setStatusAudience(uid, a))} />
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
      <p>VibeBook is your OJT logbook and a small community around it: log what you did, track your hours, and share your progress with the people you choose.</p>
      <ul className="about-list">
        <li>Daily entries with photos, video or GIF links, skills and a description, shown by day, week or month, with the hours for each day and week.</li>
        <li>Clock in and out with breaks, required hours with a progress bar, and your usual work days and schedule.</li>
        <li>Export your logbook as a Word or PDF report with your school details on every page, and back up your entries or download all your photos.</li>
        <li>Share each entry with only you, friends, the public or groups; follow people, vibe or pass, comment and repost.</li>
        <li>Groups, and private messages with end-to-end encryption.</li>
        <li>You decide who sees your friends, hours, schedule and when you are clocked in, or make the whole profile private.</li>
        <li>Make it yours: light, dark or AMOLED, accent colour and backgrounds, text size, square corners, and the page the app opens on. Add it to your home screen to use it like an app.</li>
      </ul>
      <p className="hint">Entries, photos, hours and profile are saved to your account. Display settings are saved per device.</p>
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

/** Settings > Data & account > Delete my account: the password, then a dialog that asks for the word "delete" before anything is removed. */
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
    <div className="deactivate-section" role="group" aria-label="Delete account">
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
    </div>
  );
}

/** Settings > Data & account: backup and restore, the archive, who you are signed in as, the activity log and resetting this device. */
function DataAccount({ onNavigate, onAskReset }: { onNavigate: () => void; onAskReset: () => void }) {
  const { uid, user, chats, notify } = useSession();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<{ backup: BackupFile; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function download() {
    setBusy(true);
    setStatus("Preparing your backup…");
    try {
      const file = await buildBackup(uid, (done, total) => setStatus(`Collecting your entries… ${done} of ${total}`));
      const day = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
      const result = await saveFile(new TextEncoder().encode(JSON.stringify(file)), `vibebook-backup-${day}.json`, "application/json", "Backup");
      setStatus(result === "saved" ? `Backup saved: ${file.entries.length} ${file.entries.length === 1 ? "entry" : "entries"} with their photos.`
        : result === "cancelled" ? "" : "Could not save the backup file.");
    } catch {
      setStatus("Could not make the backup. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function downloadPhotos() {
    setBusy(true);
    setStatus("Collecting your photos…");
    try {
      const { zip, count } = await buildPhotoZip(uid, (done, total) => setStatus(`Collecting your photos… entry ${done} of ${total}`));
      if (count === 0) { setStatus("You have no photos on your entries yet."); setBusy(false); return; }
      const day = new Date().toLocaleDateString("en-CA");
      const result = await saveFile(zip, `vibebook-photos-${day}.zip`, "application/zip", "Photos");
      setStatus(result === "saved" ? `Saved ${count} ${count === 1 ? "photo" : "photos"}.` : result === "cancelled" ? "" : "Could not save the photos file.");
    } catch {
      setStatus("Could not collect your photos. Check your connection and try again.");
    }
    setBusy(false);
  }

  async function chosen(file: File | undefined) {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) return setStatus("That file is too big to be a VibeBook backup.");
    try {
      setPending({ backup: parseBackup(await file.text()), name: file.name });
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  async function restore() {
    if (!pending) return;
    const { backup } = pending;
    setPending(null);
    setBusy(true);
    try {
      const r = await restoreBackup(uid, backup, setStatus);
      setStatus(`Restored: ${r.added} new, ${r.updated} updated${r.skipped ? `, ${r.skipped} skipped because they could not be read` : ""}.`);
      notify("Backup restored");
    } catch (err) {
      setStatus(err instanceof Error && !/permission|firestore/i.test(err.message) ? err.message : "Could not restore everything. Wait a few seconds and try again; entries already restored are kept.");
    }
    setBusy(false);
  }

  const archivedChats = chats.archived.length;
  return (
    <>
      <Section title="Backup">
        <div className="set-pair">
          <button type="button" className="btn" disabled={busy} onClick={download}><DownloadIcon />Download backup</button>
          <button type="button" className="btn" disabled={busy} onClick={() => fileInput.current?.click()}><UploadIcon />Restore backup</button>
        </div>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden
          onChange={(e) => { void chosen(e.target.files?.[0]); e.target.value = ""; }} />
        <p className="hint">Restoring overwrites entries with the same ID; nothing is deleted. Sharing settings of entries you already have stay as they are.</p>
        {status && <p className="hint set-status" role="status">{status}</p>}
      </Section>

      <Section title="Photos">
        <button type="button" className="btn" disabled={busy} onClick={downloadPhotos}><DownloadIcon />Download all photos</button>
        <p className="hint">One .zip with every photo on your entries, archived ones too, named by date and title.</p>
      </Section>

      <Section title="Archive">
        <div className="set-pair">
          <a className="btn" href="#/archived" onClick={onNavigate}><ArchiveIcon />Archived entries</a>
          <a className="btn" href="#/archived-chats" onClick={onNavigate}><ArchiveIcon />Archived chats{archivedChats > 0 ? ` (${archivedChats})` : ""}</a>
        </div>
      </Section>

      <Section title="Account">
        <p className="hint">Signed in as {user.email}</p>
        <div className="set-pair">
          <button type="button" className="btn" onClick={() => signOut(auth)}><LogOutIcon />Sign out</button>
          <button type="button" className="btn" onClick={() => setConfirmDeactivate(true)}><EyeOffIcon />Deactivate account</button>
          <button type="button" className="btn danger-ghost" aria-expanded={deleting} onClick={() => setDeleting(!deleting)}><TrashIcon />Delete my account…</button>
        </div>
        {deleting && <DeleteAccount />}
      </Section>

      {confirmDeactivate && (
        <ConfirmDialog
          title="Deactivate your account?"
          confirmLabel="Deactivate"
          danger
          onCancel={() => setConfirmDeactivate(false)}
          onConfirm={() => {
            setConfirmDeactivate(false);
            deactivateAccount(uid).then(
              () => signOut(auth),
              () => notify("Could not deactivate your account. If you just updated the app, deploy the Firestore rules first."),
            );
          }}
        >
          <p>Other people will see “Deactivated account” in place of your name and photo, and your entries and profile are hidden. Your friendships, chats and data are kept, and your account ID does not change.</p>
          <p>To come back, sign in again and choose Reactivate. You will be signed out now.</p>
        </ConfirmDialog>
      )}

      <Section title="Activity">
        <details className="about-terms" onToggle={(e) => e.currentTarget.open && setShowLog(true)}>
          <summary>Activity log</summary>
          {showLog && <ActivityLog onNavigate={onNavigate} />}
        </details>
      </Section>

      <Section title="This device">
        <button type="button" className="btn" onClick={onAskReset}>Reset settings</button>
        <p className="hint">Puts appearance and preferences on this device back to how they started.</p>
      </Section>

      {pending && (
        <ConfirmDialog title="Restore this backup?" confirmLabel="Restore" onCancel={() => setPending(null)} onConfirm={restore}>
          <p>{pending.name} has {pending.backup.entries.length} {pending.backup.entries.length === 1 ? "entry" : "entries"}. Entries with the same ID are overwritten with the backup’s version and the rest are added. Nothing is deleted.</p>
        </ConfirmDialog>
      )}
    </>
  );
}

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<Category>("appearance");
  const [askReset, setAskReset] = useState(false);

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !askReset && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, askReset]);

  return (
    <>
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet settings-sheet" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="sheet-head">
          <h2><SettingsIcon />Settings</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="settings-layout">
        <div className="settings-nav" role="tablist" aria-label="Settings categories" aria-orientation="vertical">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={category === c.id} onClick={() => setCategory(c.id)}>
              {c.icon}<span>{c.label}</span>
            </button>
          ))}
        </div>
        <div className="sheet-body" role="tabpanel">
          {category === "appearance" && <Appearance />}
          {category === "preferences" && (
            <>
              <Section title="Start page"><StartPageSetting /></Section>
              <Section title="New entry"><EntrySuggestionsSetting /></Section>
              <Section title="Photos"><Media /></Section>
              <Section title="Notifications"><Notifications /></Section>
              <Section title="Accessibility"><Accessibility /></Section>
            </>
          )}
          {category === "privacy" && (
            <>
              <Section title="Privacy"><Privacy /></Section>
              <Section title="Security"><SecuritySettings /></Section>
            </>
          )}
          {category === "data" && <DataAccount onNavigate={onClose} onAskReset={() => setAskReset(true)} />}
          {category === "about" && <About />}
        </div>
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn primary" onClick={onClose}><CheckIcon />Done</button>
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
