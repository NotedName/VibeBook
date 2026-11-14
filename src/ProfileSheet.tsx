import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  BIO_MAX, HEADLINE_MAX, NAME_MAX, UsernameTakenError, fetchMyUsername, normalizeUsername, pendingUsername, saveProfile, suggestUsername,
  usernameProblem,
} from "./profiles";
import UsernameField from "./UsernameField";
import { coverBanner, squareAvatar } from "./image";
import { COVERS, type CoverId, type Profile } from "./types";
import { useSession } from "./session";
import Avatar from "./Avatar";
import PhotoEditor from "./PhotoEditor";
import { CloseIcon, ImageIcon, CameraIcon, EditIcon } from "./icons";

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
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !locked && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
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
    if (!name.trim()) { setError("Add your name so people can find you."); return; }
    const problem = usernameProblem(username);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try {
      await saveProfile(uid, { displayName: name, username: normalizeUsername(username), headline, workplace, bio, avatar, cover, coverPhoto });
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
          {!setup && locked && <p className="hint">VibeBook profiles now have a unique username. It is part of your profile link, and you can change it later.</p>}

          <div className="ps-grid">
            <div className="ps-photos">
              <div className="avatar-edit">
                <Avatar profile={{ displayName: name, avatar }} size="lg" />
                <div className="avatar-edit-btns">
                  <label className="btn"><CameraIcon /> {avatar ? "Change photo" : "Add photo"}
                    <input type="file" accept="image/*" hidden onChange={pick("avatar")} />
                  </label>
                  {avatar && <button type="button" className="btn" onClick={() => adjust("avatar")}><EditIcon /> Adjust</button>}
                  {avatar && <button type="button" className="btn" onClick={() => setAvatar("")}>Remove</button>}
                </div>
              </div>

              <div className="cover-edit">
                <span className="field-label">Cover photo</span>
                <div className={`cover-preview c-${cover}`}>
                  {coverPhoto && <img src={coverPhoto} alt="" />}
                </div>
                <div className="avatar-edit-btns">
                  <label className="btn"><ImageIcon /> {coverPhoto ? "Change cover photo" : "Add cover photo"}
                    <input type="file" accept="image/*" hidden onChange={pick("cover")} />
                  </label>
                  {coverPhoto && <button type="button" className="btn" onClick={() => adjust("cover")}><EditIcon /> Adjust</button>}
                  {coverPhoto && <button type="button" className="btn" onClick={() => setCoverPhoto("")}>Remove</button>}
                </div>
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
                  placeholder="Your full name" autoComplete="name" />
              </label>
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

          {error && <p className="error" role="alert">{error}</p>}
        </div>

        <div className="sheet-actions">
          {!locked && <button type="button" className="btn" onClick={onClose}>Cancel</button>}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : setup ? "Continue" : "Save profile"}</button>
        </div>
      </form>
      {editing && (
        <PhotoEditor file={editing.file} onCancel={() => setEditing(null)} onApply={applyEdit}
          fixedRatio={editing.kind === "avatar" ? 1 : 3} outSide={editing.kind === "avatar" ? 512 : 1200}
          title={editing.kind === "avatar" ? "Adjust profile photo" : "Adjust cover photo"} />
      )}
    </div>
  );
}
