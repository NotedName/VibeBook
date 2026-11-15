import { useState } from "react";
import { calledBy, isUnread, useChatSettings, type Conversation } from "./messages";
import { ago } from "./notifications";
import { useProfile } from "./session";
import Avatar from "./Avatar";
import ChatActionsSheet from "./ChatActionsSheet";
import Highlight from "./Highlight";
import { BellOffIcon, MenuIcon } from "./icons";

export const threadHash = (uid: string) => `#/m/${encodeURIComponent(uid)}`;
export const nameOf = (p: { displayName: string } | null | undefined) => (p === undefined ? "…" : p?.displayName || "VibeBook member");

/** One conversation in a list: the person (by nickname if you gave one), the last message, and a hamburger for the chat's actions. */
export default function ChatRow({ chat, uid, q = "" }: { chat: Conversation; uid: string; q?: string }) {
  const p = useProfile(chat.other);
  const settings = useChatSettings(uid, chat.other);
  const [menu, setMenu] = useState(false);
  const name = calledBy(settings, chat.other, nameOf(p));
  const unread = isUnread(chat, uid) && !chat.blocked;
  return (
    <li className="chat-item">
      <a className={`chat-row${unread ? " unread" : ""}`} href={threadHash(chat.other)}>
        <Avatar profile={p} size="md" />
        <span className="chat-row-text">
          <b><Highlight text={name} q={q} /></b>
          <span>{chat.blocked ? "You blocked this person" : <>{chat.lastFrom === uid ? "You: " : ""}<Highlight text={chat.lastText} q={q} /></>}</span>
        </span>
        <span className="chat-row-meta">
          <time>{ago(chat.updatedAt)}</time>
          <span className="chat-row-flags">
            {chat.muted && <BellOffIcon />}
            {unread && <i className="chat-dot" role="img" aria-label="Unread" />}
          </span>
        </span>
      </a>
      <button type="button" className="icon-btn chat-row-menu" aria-label={`Chat options for ${name}`} aria-haspopup="dialog"
        onClick={() => setMenu(true)}><MenuIcon /></button>
      {menu && <ChatActionsSheet other={chat.other} profile={p} name={name} onClose={() => setMenu(false)} />}
    </li>
  );
}
