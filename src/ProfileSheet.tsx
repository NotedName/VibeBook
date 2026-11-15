import FormError from "./FormError";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  BIO_MAX, HEADLINE_MAX, NAME_MAX, UsernameTakenError, fetchMyUsername, normalizeUsername, pendingUsername, saveProfile, suggestUsername, deactivateAccount,
  usernameProblem,
} from "./profiles";
import UsernameField from "./UsernameField";
import { coverBanner, squareAvatar } from "./image";
import { COVERS, type CoverId, type Profile } from "./types";
import { useSession } from "./session";
import Avatar from "./Avatar";
import PhotoEditor from "./PhotoEditor";
import { CloseIcon, ImageIcon, CameraIcon, EditIcon, TrashIcon } from "./icons";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import ConfirmDialog from "./ConfirmDialog";
import { canAutoFocus } from "./focus";
import { useScrollLock } from "./scrollLock";
import { DropHint, useImageDrop } from "./imageDrop";

/** The same three buttons, the same size, for the profile photo and the cover photo: Change, Adjust and Remove. */
function PhotoActions({ has, addLabel, changeLabel, icon, onPick, onAdjust, onRemove }: {
  has: boolean; addLabel: string; changeLabel: string; icon: ReactNode;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void; onAdjust: () => void; onRemove: () => void;
}) {
  return (
    <div className={`photo-actions${has ? "" : " solo"}`}>
      <label className="btn small">{icon}<span>{has ? changeLabel : addLabel}</span>
        <input type="file" accept="image/*" hidden onChange={onPick} />
      </label>
      {has && <button type="button" className="btn small" onClick={onAdjust}><EditIcon /><span>Adjust</span></button>}
      {has && <button type="button" className="btn small danger" onClick={onRemove}><TrashIcon /><span>Remove</span></button>}
    </div>
  );
}

const NAME_MISSING = "Add your name so people can find you.";

type Props = {
  /** null = first-time setup, which cannot be dismissed until a name and username are saved. An older profile with no username is treated the same way. */
  profile: Profile | null;
  suggestedName?: string;
  onClose: () => void;
};

export default function ProfileSheet({ profile, suggestedName = "", onClose }: Props) {
  const { uid, notify } = useSession();
  const setup = profile === null;
  const locked = profile === null || !profile.username; // cannot be closed until a username is saved
  const [name, setName] = useState(profile?.displayName ?? suggestedName);
  const [username, setUsername] = useState(profile?.username ?? "");
  const [headline, setHeadline] = useState(profile?.headline ?? "OJT intern");
  const [workplace, setWorkplace] = useState(profile?.workplace ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [avatar, setAvatar] = useState(profile?.avatar ?? "");
  const [cover, setCover] = useState<CoverId>(profile?.cover ?? "amethyst");
  const [coverPhoto, setCoverPhoto] = useState(profile?.coverPhoto ?? "");
  const [busy, setBusy] = useState(false);
  // the photo being cropped and adjusted, and which one it is for
  const [editing, setEditing] = useState<{ kind: "avatar" | "cover"; file: File } | null>(null);
  const [error, setError] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // A picture dragged onto the photo or the cover opens the same editor as choosing one (computers only).
  const notPicture = () => notify("Drop a picture file.");
  const avatarDrop = useImageDrop((f) => setEditing({ kind: "avatar", file: f[0] }), { onRejected: notPicture });
  const coverDrop = useImageDrop((f) => setEditing({ kind: "cover", file: f[0] }), { onRejected: notPicture });

  useScrollLock();
  useEffect(() => {
    if (canAutoFocus()) nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !locked && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [onClose, locked]);

  // No username yet: use one already held, else the one typed at sign-up, else suggest one from the name. Never overwrites typing.
  useEffect(() => {
    if (!locked) return;
    let live = true;
    fetchMyUsername(uid).then(
      (held) => live && setUsername((cur) => cur || held || pendingUsername(uid) || suggestUsername(name)),
      () => live && setUsername((cur) => cur || pendingUsername(uid) || suggestUsername(name)),
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, uid]);

  // Choosing a photo opens the editor so it can be framed before it is used.
  function pick(kind: "avatar" | "cover") {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) setEditing({ kind, file: f });
    };
  }

  /** Re-open the photo already on the profile to adjust it. */
  async function adjust(kind: "avatar" | "cover") {
    try {
      const blob = await (await fetch(kind === "avatar" ? avatar : coverPhoto)).blob();
      setEditing({ kind, file: new File([blob], `${kind}.jpg`, { type: blob.type || "image/jpeg" }) });
    } catch { setError("That photo could not be opened."); }
  }

  async function applyEdit(edited: File) {
    const kind = editing!.kind;
    setEditing(null);
    try {
      // the editor already framed it exactly, so these only shrink it to what a profile can store
      if (kind === "avatar") setAvatar(await squareAvatar(edited));
      else setCoverPhoto(await coverBanner(edited));
      setError("");
    } catch { setError(kind === "avatar" ? "That image could not be read." : "That image could not be used as a cover."); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(NAME_MISSING); return; }
    const problem = usernameProblem(username);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try {
      await saveProfile(uid, { displayName: name, username: normalizeUsername(username), headline, workplace, bio, avatar, cover, coverPhoto, friendsAudience: profile?.friendsAudience ?? "everyone", hoursAudience: profile?.hoursAudience ?? "private", scheduleAudience: profile?.scheduleAudience ?? "private", privateProfile: profile?.privateProfile ?? false });
      notify(setup ? "Welcome to VibeBook" : "Profile saved");
      onClose();
    } catch (err) {
      setError(err instanceof UsernameTakenError ? err.message : "Could not save your profile. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose()}>
      <form className="sheet profile-sheet" role="dialog" aria-modal="true" aria-label={setup ? "Set up your profile" : locked ? "Choose a username" : "Edit profile"} onSubmit={submit}>
        <div className="sheet-head">
          <h2>{setup ? "Set up your profile" : locked ? "Choose a username" : "Edit profile"}</h2>
          {!locked && <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>}
        </div>

        <div className="sheet-body">
          {setup && <p className="hint">This is what friends see when they find you. Your email address is never shown.</p>}
          {!setup && locked && <p className="hint">Pick a unique username. It is part of your profile link and can be changed later.</p>}

          <div className="ps-grid">
            <div className="ps-photos">
              <div className={`avatar-edit drop-zone${avatarDrop.over ? " drop-over one" : ""}`} {...avatarDrop.bind}>
                {avatarDrop.over && <DropHint label="Drop photo" />}
                <Avatar profile={{ displayName: name, avatar }} size="lg" />
                <span className="field-label">Profile photo</span>
                <PhotoActions has={!!avatar} addLabel="Add photo" changeLabel="Change" icon={<CameraIcon />}
                  onPick={pick("avatar")} onAdjust={() => adjust("avatar")} onRemove={() => setAvatar("")} />
              </div>

              <div className={`cover-edit drop-zone${coverDrop.over ? " drop-over one" : ""}`} {...coverDrop.bind}>
                {coverDrop.over && <DropHint label="Drop cover photo" />}
                <span className="field-label">Cover photo</span>
                <div className={`cover-preview c-${cover}`}>
                  {coverPhoto && <img src={coverPhoto} alt="" />}
                </div>
                <PhotoActions has={!!coverPhoto} addLabel="Add cover" changeLabel="Change" icon={<ImageIcon />}
                  onPick={pick("cover")} onAdjust={() => adjust("cover")} onRemove={() => setCoverPhoto("")} />
              </div>

              {!coverPhoto && (
                <fieldset className="covers">
                  <legend>Cover color <small>(shown when there is no cover photo)</small></legend>
                  {COVERS.map((c) => (
                    <label key={c.id} className={`cover-opt${cover === c.id ? " on" : ""}`}>
                      <input type="radio" name="cover" value={c.id} checked={cover === c.id} onChange={() => setCover(c.id)} />
                      <span className={`swatch c-${c.id}`} /> {c.label}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
            <div className="ps-fields">
              <label>Name
                <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} required
                  placeholder="e.g. Juan Dela Cruz" autoComplete="name" aria-invalid={error === NAME_MISSING || undefined} />
              </label>
              {error === NAME_MISSING && <FormError>{error}</FormError>}
              <UsernameField value={username} onChange={setUsername} selfUid={uid} />
              <label>Headline
                <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={HEADLINE_MAX}
                  placeholder="e.g. OJT intern, IT department" />
              </label>
              <label>Company or school
                <input value={workplace} onChange={(e) => setWorkplace(e.target.value)} maxLength={HEADLINE_MAX}
                  placeholder="e.g. St. Mary's College" />
              </label>
              <label>About you
                <textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={BIO_MAX}
                  placeholder="A line or two about what you are working on." />
                <small className="count">{bio.length}/{BIO_MAX}</small>
              </label>
            </div>
          </div>

          {error && error !== NAME_MISSING && <FormError>{error}</FormError>}

          {!locked && (
            <section className="deactivate-section" aria-label="Deactivate account">
              <h3>Deactivate account</h3>
              <p className="hint">Hides your profile, entries and name from everyone until you sign in again and reactivate. Nothing is deleted, and your account ID stays yours.</p>
              <button type="button" className="btn danger" onClick={() => setConfirmOff(true)}>Deactivate my account</button>
            </section>
          )}
        </div>

        <div className="sheet-actions">
          {!locked && <button type="button" className="btn" onClick={onClose}>Cancel</button>}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : setup ? "Continue" : "Save profile"}</button>
        </div>
      </form>
      {confirmOff && (
        <ConfirmDialog title="Deactivate your account?" confirmLabel="Deactivate" danger onCancel={() => setConfirmOff(false)}
          onConfirm={() => {
            setConfirmOff(false);
            deactivateAccount(uid).then(() => signOut(auth), () => notify("Could not deactivate your account. If you just updated the app, deploy the Firestore rules first."));
          }}>
          <p>Other people will see “Deactivated account” in place of your name and photo, and your entries and profile are hidden. Your friendships, chats and data are kept, and your account ID does not change.</p>
          <p>To come back, sign in again and choose Reactivate. You will be signed out now.</p>
        </ConfirmDialog>
      )}
      {editing && (
        <PhotoEditor file={editing.file} onCancel={() => setEditing(null)} onApply={applyEdit}
          fixedRatio={editing.kind === "avatar" ? 1 : 3} outSide={editing.kind === "avatar" ? 512 : 1200}
          title={editing.kind === "avatar" ? "Adjust profile photo" : "Adjust cover photo"} />
      )}
    </div>
  );
}
