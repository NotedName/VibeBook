import { useEffect } from "react";
import { personHash } from "./profiles";
import { usePreferences } from "./preferences";
import { useScrollLock } from "./scrollLock";
import Avatar from "./Avatar";
import type { Profile } from "./types";
import { BellIcon, BellOffIcon, CloseIcon, SearchIcon, UserIcon } from "./icons";

type Props = { uid: string; profile: Profile | null | undefined; friend: boolean; onSearch: () => void; onClose: () => void };

/**
 * What opens when you tap the person at the top of a conversation, like the info panel in Messenger: who they are, quick
 * buttons (Profile, Mute, Search) and this chat's settings. Settings are saved on this device.
 */
export default function ChatInfoSheet({ uid, profile, friend, onSearch, onClose }: Props) {
  const prefs = usePreferences();
  const muted = prefs.mutedChats.includes(uid);
  const name = profile === undefined ? "…" : profile?.displayName || "VibeBook member";

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet chat-info" role="dialog" aria-modal="true" aria-label={`Chat with ${name}`}>
        <div className="sheet-head">
          <h2>Chat info</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <div className="chat-info-who">
            <Avatar profile={profile} size="lg" />
            <b>{name}</b>
            {profile?.username && <span>@{profile.username}</span>}
            <small>{friend ? "Friends on VibeBook" : "Not friends yet"}</small>
          </div>

          <div className="chat-info-actions">
            <a className="chat-info-act" href={personHash(uid, profile)} onClick={onClose}>
              <i><UserIcon /></i>Profile
            </a>
            <button type="button" className={`chat-info-act${muted ? " on" : ""}`} aria-pressed={muted} onClick={() => prefs.setChatMuted(uid, !muted)}>
              <i>{muted ? <BellOffIcon /> : <BellIcon />}</i>{muted ? "Unmute" : "Mute"}
            </button>
            <button type="button" className="chat-info-act" onClick={onSearch}>
              <i><SearchIcon /></i>Search
            </button>
          </div>

          <section className="chat-info-settings" aria-label="Chat settings">
            <h3>Settings</h3>
            <label className="switch-row">
              <span>Mute this chat<small>Messages from {name} still arrive but are not counted as unread</small></span>
              <input type="checkbox" role="switch" checked={muted} onChange={(e) => prefs.setChatMuted(uid, e.target.checked)} />
              <i className="switch" aria-hidden="true" />
            </label>
            <label className="switch-row">
              <span>Enter sends the message<small>Off: Enter adds a new line. Applies to all chats on this device</small></span>
              <input type="checkbox" role="switch" checked={enterOn(prefs.enterSends)} onChange={(e) => prefs.setEnterSends(e.target.checked)} />
              <i className="switch" aria-hidden="true" />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}

const enterOn = (v: "auto" | "on" | "off") => (v === "auto" ? !window.matchMedia("(pointer: coarse)").matches : v === "on");
