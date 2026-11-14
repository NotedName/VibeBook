import { useSession } from "./session";
import { MessagesIcon } from "./icons";

/** Messages in the top bar, with how many conversations have something you have not read. */
export default function MessagesButton({ on }: { on: boolean }) {
  const { unread } = useSession().chats;
  return (
    <a href="#/messages" className={`icon-btn bell${on ? " on" : ""}`} aria-current={on ? "page" : undefined}
      aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}>
      <MessagesIcon />
      {unread > 0 && <i className="badge bell-badge">{unread > 99 ? "99+" : unread}</i>}
    </a>
  );
}
