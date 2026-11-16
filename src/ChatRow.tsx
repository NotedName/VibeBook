import { useState } from "react";
import { calledBy, isUnread, useChatSettings, type Conversation } from "./messages";
import { usePresence } from "./activeStatus";
import { ago } from "./notifications";
import { useProfile, useSession } from "./session";
import Avatar from "./Avatar";
import ChatActionsSheet from "./ChatActionsSheet";
import Highlight from "./Highlight";
import { BellOffIcon, MenuIcon } from "./icons";

export const threadHash = (uid: string) => `#/m/${encodeURIComponent(uid)}`;
export const nameOf = (p: { displayName: string } | null | undefined) => (p === undefined ? "…" : p?.displayName || "VibeBook member");

/** One conversation in a list: the person (by nickname if you gave one), the last message, and a hamburger for the chat's actions. */
export default function ChatRow({ chat, uid, q = "" }: { chat: Conversation; uid: string; q?: string }) {
  const p = useProfile(chat.other);
  const s = useSession();
  const settings = useChatSettings(uid, chat.other);
  const presence = usePresence(chat.other);
  const [menu, setMenu] = useState(false);
  const name = calledBy(settings, chat.other, nameOf(p));
  const unread = isUnread(chat, uid) && !chat.blocked;
  // Same rule as the chat itself: with read receipts off for this chat, nobody sees when anything was read.
  const seen = chat.lastFrom === uid && !chat.blocked && s.chats.prefsOf(chat.other).receipts && chat.otherSeenAt >= chat.updatedAt;
  return (
    <li className="chat-item">
      <a className={`chat-row${unread ? " unread" : ""}`} href={threadHash(chat.other)}>
        <Avatar profile={p} size="md" active={presence.status === "active"} />
        <span className="chat-row-text">
          <b><Highlight text={name} q={q} /></b>
          <span>{chat.blocked ? "You blocked this person" : <>{chat.lastFrom === uid ? "You: " : ""}<Highlight text={chat.lastText} q={q} /></>}</span>
        </span>
        <span className="chat-row-meta">
          <time>{ago(chat.updatedAt)}</time>
          <span className="chat-row-flags">
            {chat.muted && <BellOffIcon />}
            {unread && <i className="chat-dot" role="img" aria-label="Unread" />}
            {seen && <span className="chat-seen" role="img" aria-label="Seen"><Avatar profile={p} size="sm" /></span>}
          </span>
        </span>
      </a>
      <button type="button" className="icon-btn chat-row-menu" aria-label={`Chat options for ${name}`} aria-haspopup="dialog"
        onClick={() => setMenu(true)}><MenuIcon /></button>
      {menu && <ChatActionsSheet other={chat.other} profile={p} name={name} onClose={() => setMenu(false)} />}
    </li>
  );
}
