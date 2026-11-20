import { useEffect, useState, type ReactNode } from "react";
import { shareBase } from "./platform";
import type { Profile } from "./types";
import { activeNoteText, noteExpiry, personHash } from "./profiles";
import { copyText } from "./report";
import { useSession } from "./session";
import Avatar from "./Avatar";
import ImageViewer from "./ImageViewer";
import { CopyIcon, EditIcon, EyeIcon, MoreIcon } from "./icons";
import NoteSheet from "./NoteSheet";
import NoteViewSheet from "./NoteViewSheet";

type Kind = "avatar" | "cover";

type Props = {
  profile: Profile;
  children?: ReactNode;
  /** Your own profile: shows the three-dot menu. Photos are changed in Edit profile, not here. */
  editable?: boolean;
  /** Your own profile: the three-dot menu in the top right offers these. */
  onEditProfile?: () => void;
  onViewAs?: () => void;
};

export default function ProfileHeader({ profile, children, editable = false, onEditProfile, onViewAs }: Props) {
  const [viewing, setViewing] = useState<Kind | null>(null);
  const [more, setMore] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteView, setNoteView] = useState(false);
  const note = activeNoteText(profile);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [more]);
  const choose = (action?: () => void) => () => { setMore(false); action?.(); };
  const { notify, manualCopy } = useSession();
  async function copyLink() {
    setMore(false);
    const url = `${shareBase()}${personHash(profile.uid, profile)}`;
    if (await copyText(url)) notify("Profile link copied");
    else manualCopy(url);
  }
  return (
    <section className="profile" aria-label="Profile">
      <div className="cover-wrap">
        <div className={`cover c-${profile.cover}`} aria-hidden="true">
          {profile.coverPhoto && <img src={profile.coverPhoto} alt="" />}
        </div>
        {profile.coverPhoto && (
          <button type="button" className="photo-view cover-view" aria-label={`View ${profile.displayName}'s cover photo`} onClick={() => setViewing("cover")} />
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
              <button type="button" role="menuitem" onClick={copyLink}><CopyIcon />Copy profile link</button>
            </div>
          </div>
        )}
      </div>
      <div className="pad">
        <div className="who">
          <div className="avatar-wrap">
            <Avatar profile={profile} size="lg" />
            {profile.avatar && (
              <button type="button" className="photo-view avatar-view" aria-label={`View ${profile.displayName}'s profile photo`} onClick={() => setViewing("avatar")} />
            )}
          </div>
          <div className="who-text">
            <h1 className="name">{profile.displayName}</h1>
            {profile.username && <div className="handle">@{profile.username}</div>}
            {profile.headline && <div className="role">{profile.headline}</div>}
          </div>
        </div>
        {editable ? (
          <button type="button" className={`profile-note${note ? " has-note" : ""}`} onClick={() => setNoteOpen(true)}
            aria-label={note ? `Your note: ${note}. Change it` : "Add a note that disappears after 24 hours"}>
            <span className="profile-note-text">{note || "Add a note"}</span>
            <small>{note ? noteExpiry(profile) : "Disappears after 24 hours"}</small>
          </button>
        ) : note && (
          <button type="button" className="profile-note has-note" onClick={() => setNoteView(true)} aria-label={`${profile.displayName}'s note: ${note}. Open to reply`}>
            <span className="profile-note-text">{note}</span><small>Tap to reply</small>
          </button>
        )}
        {(profile.workplace || profile.bio) && (
          <div className="about">
            {profile.workplace && <div className="workplace">{profile.workplace}</div>}
            {profile.bio && <p>{profile.bio}</p>}
          </div>
        )}
        {children}
      </div>
      {noteView && <NoteViewSheet uid={profile.uid} onClose={() => setNoteView(false)} />}
      {noteOpen && <NoteSheet initial={note} noteAt={profile.noteAt} onClose={() => setNoteOpen(false)} />}
      {viewing && (viewing === "avatar" ? profile.avatar : profile.coverPhoto) && (
        <ImageViewer src={viewing === "avatar" ? profile.avatar : profile.coverPhoto}
          label={viewing === "avatar" ? `${profile.displayName}'s profile photo` : `${profile.displayName}'s cover photo`} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}
