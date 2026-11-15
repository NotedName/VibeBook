import { useEffect, useState } from "react";
import { personHash } from "./profiles";
import { isUnread } from "./messages";
import { useSession } from "./session";
import { useScrollLock } from "./scrollLock";
import { useChatCommands } from "./chatCommands";
import MuteChoices from "./MuteChoices";
import type { Profile } from "./types";
import { ArchiveIcon, ArrowLeftIcon, BellIcon, BellOffIcon, BlockIcon, CheckIcon, CloseIcon, TrashIcon, UnarchiveIcon, UserIcon } from "./icons";

type Props = { other: string; profile: Profile | null | undefined; name: string; onClose: () => void };

/**
 * The hamburger menu of a chat (in the conversation's top bar and on each row of the inbox): mark as read, mute for a while,
 * view profile, block, archive and delete. The same actions are in the chat info panel.
 */
export default function ChatActionsSheet({ other, profile, name, onClose }: Props) {
  const s = useSession();
  const chat = s.chats.all.find((c) => c.other === other);
  const prefs = s.chats.prefsOf(other);
  const muted = chat?.muted ?? false;
  const blocked = s.chats.blocked.has(other);
  const unread = chat ? isUnread(chat, s.uid) : false;
  const archived = s.chats.archived.some((c) => c.other === other);
  const cmd = useChatCommands(other, name, prefs, onClose);
  const [view, setView] = useState<"main" | "mute">("main");

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (view === "mute" ? setView("main") : onClose());
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, view]);

  // Do the action, then close (the sheet and the page behind it settle on their own once the change is saved).
  const run = (f: () => unknown) => () => { onClose(); f(); };

  if (cmd.dialogs) return <>{cmd.dialogs}</>;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet chat-actions" role="dialog" aria-modal="true" aria-label={`Chat with ${name}`}>
        <div className="sheet-head">
          {view === "mute" && (
            <button type="button" className="icon-btn sheet-back" aria-label="Back" onClick={() => setView("main")}><ArrowLeftIcon /></button>
          )}
          <h2>{view === "mute" ? "Mute notifications" : name}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          {view === "mute" ? (
            <MuteChoices prefs={prefs} muted={muted} onPick={(ms) => { onClose(); void cmd.mute(ms); }}
              onUnmute={() => { onClose(); void cmd.unmute(); }} />
          ) : (
            <div className="action-list" role="menu">
              {unread && (
                <button type="button" role="menuitem" className="action-row" onClick={run(cmd.markRead)}>
                  <i><CheckIcon /></i>Mark as read
                </button>
              )}
              <button type="button" role="menuitem" className="action-row" onClick={() => setView("mute")}>
                <i>{muted ? <BellOffIcon /> : <BellIcon />}</i>
                <span>{muted ? "Muted" : "Mute notifications"}<small>{muted ? "Tap to change or unmute" : "Choose how long"}</small></span>
              </button>
              <a role="menuitem" className="action-row" href={personHash(other, profile)} onClick={onClose}>
                <i><UserIcon /></i>View profile
              </a>
              <button type="button" role="menuitem" className="action-row" onClick={() => (blocked ? run(cmd.unblock)() : cmd.askBlock())}>
                <i><BlockIcon /></i>{blocked ? "Unblock" : "Block"}
              </button>
              <button type="button" role="menuitem" className="action-row" onClick={run(() => cmd.archive(!archived))}>
                <i>{archived ? <UnarchiveIcon /> : <ArchiveIcon />}</i>{archived ? "Unarchive chat" : "Archive chat"}
              </button>
              <button type="button" role="menuitem" className="action-row danger" onClick={cmd.askDelete}>
                <i><TrashIcon /></i>Delete chat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
