import { useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useSession } from "./session";
import Avatar from "./Avatar";
import { ArchiveIcon, BookIcon, CloseIcon } from "./icons";
import { useScrollLock } from "./scrollLock";

/** Opened from the profile picture in the top bar: who you are signed in as, a way to your profile, and Sign out. */
export default function AccountSheet({ email, onClose }: { email: string; onClose: () => void }) {
  const { me, chats } = useSession();

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Account">
        <div className="sheet-head">
          <h2>Account</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <div className="account-who">
            <Avatar profile={me} size="md" />
            <div className="who-text">
              <b className="account-name">{me?.displayName}</b>
              <span className="hint">{email}</span>
            </div>
          </div>
          <a className="btn" href="#/me" onClick={onClose}><BookIcon />View my logbook</a>
          <a className="btn" href="#/archived" onClick={onClose}><ArchiveIcon />Archived entries</a>
          <a className="btn" href="#/archived-chats" onClick={onClose}><ArchiveIcon />Archived chats{chats.archived.length > 0 ? ` (${chats.archived.length})` : ""}</a>
          <button type="button" className="btn primary" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
