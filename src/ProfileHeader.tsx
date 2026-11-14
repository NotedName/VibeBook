import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { Profile } from "./types";
import { saveProfile } from "./profiles";
import { coverBanner, squareAvatar } from "./image";
import { useSession } from "./session";
import Avatar from "./Avatar";
import PhotoEditor from "./PhotoEditor";
import { CameraIcon, EditIcon, EyeIcon, ImageIcon, MoreIcon, TrashIcon } from "./icons";

type Kind = "avatar" | "cover";

type Props = {
  profile: Profile;
  children?: ReactNode;
  /** Your own profile: shows buttons to change or adjust the profile photo and the cover photo in place. */
  editable?: boolean;
  /** Your own profile: the three-dot menu in the top right offers these. */
  onEditProfile?: () => void;
  onViewAs?: () => void;
};

/** The photo menu and editor for your own profile photo or cover, saving straight to your profile. */
function usePhotoEditing(profile: Profile) {
  const { uid, notify } = useSession();
  const [menu, setMenu] = useState<Kind | null>(null);
  const [editing, setEditing] = useState<{ kind: Kind; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const picking = useRef<Kind>("avatar");

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);

  const current = (kind: Kind) => (kind === "avatar" ? profile.avatar : profile.coverPhoto);

  function upload(kind: Kind) {
    picking.current = kind;
    setMenu(null);
    input.current?.click();
  }
  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setEditing({ kind: picking.current, file });
  }
  /** Reopens the photo that is already on the profile, so it can be re-framed or brightened. */
  async function adjust(kind: Kind) {
    setMenu(null);
    try {
      const blob = await (await fetch(current(kind))).blob();
      setEditing({ kind, file: new File([blob], `${kind}.jpg`, { type: blob.type || "image/jpeg" }) });
    } catch { notify("That photo could not be opened"); }
  }

  const { uid: _omit, ...rest } = profile;
  void _omit;
  async function save(change: Partial<Pick<Profile, "avatar" | "coverPhoto">>, ok: string) {
    setBusy(true);
    try { await saveProfile(uid, { ...rest, ...change }); notify(ok); }
    catch { notify("Could not save the photo. Try again."); }
    finally { setBusy(false); }
  }
  function remove(kind: Kind) {
    setMenu(null);
    save(kind === "avatar" ? { avatar: "" } : { coverPhoto: "" }, kind === "avatar" ? "Profile photo removed" : "Cover photo removed");
  }
  async function apply(edited: File) {
    const kind = editing!.kind;
    setEditing(null);
    try {
      if (kind === "avatar") await save({ avatar: await squareAvatar(edited) }, "Profile photo updated");
      else await save({ coverPhoto: await coverBanner(edited) }, "Cover photo updated");
    } catch { notify(kind === "avatar" ? "That image could not be read" : "That image could not be used as a cover"); }
  }

  const photoMenu = (kind: Kind) => menu === kind && (
    <>
      <button type="button" className="menu-scrim" aria-label="Close menu" onClick={() => setMenu(null)} />
      <div className="menu photo-menu" role="menu">
        <button type="button" role="menuitem" onClick={() => upload(kind)}>
          {kind === "avatar" ? <CameraIcon /> : <ImageIcon />}{current(kind) ? "Choose a new photo" : "Add a photo"}
        </button>
        {current(kind) && <button type="button" role="menuitem" onClick={() => adjust(kind)}><EditIcon />Adjust current photo</button>}
        {current(kind) && <button type="button" role="menuitem" className="danger" onClick={() => remove(kind)}><TrashIcon />Remove photo</button>}
      </div>
    </>
  );

  const editor = (
    <>
      <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
      {editing && (
        <PhotoEditor file={editing.file} onCancel={() => setEditing(null)} onApply={apply}
          fixedRatio={editing.kind === "avatar" ? 1 : 3} outSide={editing.kind === "avatar" ? 512 : 1200}
          title={editing.kind === "avatar" ? "Adjust profile photo" : "Adjust cover photo"} />
      )}
    </>
  );
  return { menu, setMenu, busy, photoMenu, editor };
}

export default function ProfileHeader({ profile, children, editable = false, onEditProfile, onViewAs }: Props) {
  const photos = usePhotoEditing(profile);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [more]);
  const choose = (action?: () => void) => () => { setMore(false); action?.(); };
  const { menu, setMenu, busy, photoMenu, editor } = photos;
  return (
    <section className="profile" aria-label="Profile">
      <div className="cover-wrap">
        <div className={`cover c-${profile.cover}`} aria-hidden="true">
          {profile.coverPhoto && <img src={profile.coverPhoto} alt="" />}
        </div>
        {editable && (
          <button type="button" className="photo-edit-btn cover-edit-btn" disabled={busy} aria-haspopup="menu"
            aria-expanded={menu === "cover"} onClick={() => setMenu(menu === "cover" ? null : "cover")}>
            <EditIcon /> Edit cover
          </button>
        )}
        {editable && (
          <button type="button" className="icon-btn profile-more" aria-label="Profile options" aria-haspopup="menu"
            aria-expanded={more} onClick={() => setMore(!more)}><MoreIcon /></button>
        )}
        {editable && more && (
          <div className="photo-menu-anchor more-anchor">
            <button type="button" className="menu-scrim" aria-label="Close menu" onClick={() => setMore(false)} />
            <div className="menu photo-menu" role="menu">
              <button type="button" role="menuitem" onClick={choose(onEditProfile)}><EditIcon />Edit profile</button>
              <button type="button" role="menuitem" onClick={choose(onViewAs)}><EyeIcon />View as</button>
            </div>
          </div>
        )}
        {editable && menu === "cover" && <div className="photo-menu-anchor cover-anchor">{photoMenu("cover")}</div>}
      </div>
      <div className="pad">
        <div className="who">
          <div className="avatar-wrap">
            <Avatar profile={profile} size="lg" />
            {editable && (
              <button type="button" className="avatar-edit-badge" disabled={busy} aria-label="Edit profile photo"
                aria-haspopup="menu" aria-expanded={menu === "avatar"} onClick={() => setMenu(menu === "avatar" ? null : "avatar")}>
                <CameraIcon />
              </button>
            )}
            {editable && menu === "avatar" && <div className="photo-menu-anchor avatar-anchor">{photoMenu("avatar")}</div>}
          </div>
          <div className="who-text">
            <h1 className="name">{profile.displayName}</h1>
            {profile.headline && <div className="role">{profile.headline}</div>}
          </div>
        </div>
        {(profile.workplace || profile.bio) && (
          <div className="about">
            {profile.workplace && <div className="workplace">{profile.workplace}</div>}
            {profile.bio && <p>{profile.bio}</p>}
          </div>
        )}
        {children}
      </div>
      {editable && editor}
    </section>
  );
}
