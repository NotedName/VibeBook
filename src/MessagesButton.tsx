import { useSession } from "./session";
import { isUnread } from "./messages";
import { MessagesIcon } from "./icons";

/** Messages in the top bar, with how many conversations have something you have not read (muted and blocked chats are not counted). */
export default function MessagesButton({ on }: { on: boolean }) {
  const s = useSession();
  const unread = s.chats.list.filter((c) => isUnread(c, s.uid) && !c.muted && !c.blocked).length;
  return (
    <a href="#/messages" className={`icon-btn bell${on ? " on" : ""}`} aria-current={on ? "page" : undefined}
      aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}>
      <MessagesIcon />
      {unread > 0 && <i className="badge bell-badge">{unread > 99 ? "99+" : unread}</i>}
    </a>
  );
}
