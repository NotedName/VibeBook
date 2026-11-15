import { useState, type ReactNode } from "react";
import {
  archiveChat, blockPerson, deleteChatForMe, markRead, muteChat, MUTE_FOREVER, setReadReceipts, unblockPerson, type ChatPrefs,
} from "./messages";
import { usePreferences } from "./preferences";
import { useSession } from "./session";
import ConfirmDialog from "./ConfirmDialog";

/** How long a chat can be muted for (Messenger's choices). */
export const MUTE_CHOICES: { label: string; ms: number }[] = [
  { label: "For 15 minutes", ms: 15 * 60_000 },
  { label: "For 1 hour", ms: 60 * 60_000 },
  { label: "For 8 hours", ms: 8 * 60 * 60_000 },
  { label: "For 24 hours", ms: 24 * 60 * 60_000 },
  { label: "Until I turn it back on", ms: MUTE_FOREVER },
];

/** "Muted until 4:30 PM", "Muted until tomorrow 9:00 AM", or "Muted" for good. */
export function muteLabel(until: number, now = Date.now()): string {
  if (until >= MUTE_FOREVER) return "Muted";
  const d = new Date(until);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const days = Math.round((new Date(until).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return `Muted until ${time}`;
  if (days === 1) return `Muted until tomorrow ${time}`;
  return `Muted until ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

type Pending = "delete" | "block" | null;

/**
 * Everything you can do to a chat from the ⋯ menu or the chat info panel: mark read, mute for a while, archive, delete it for
 * yourself, block, and turn read receipts off. Each one saves, says what happened, and tells you if it could not be saved.
 * `dialogs` holds the "are you sure?" boxes; render it once next to whatever calls these. `onConfirmed` runs when one is confirmed.
 */
export function useChatCommands(other: string, name: string, prefs: ChatPrefs, onConfirmed?: () => void) {
  const s = useSession();
  const local = usePreferences();
  const [pending, setPending] = useState<Pending>(null);
  const fail = (what: string) => () => s.notify(`Could not ${what}. If you just updated the app, deploy the Firestore rules first.`);
  /** Chats that disappear from the inbox (archived, deleted, blocked): leave the conversation if it is open. */
  const leaveIfOpen = () => { if (location.hash.startsWith("#/m/")) location.hash = "#/messages"; };

  const commands = {
    markRead: () => markRead(s.uid, other, prefs.receipts).then(() => s.notify("Marked as read"), fail("mark this chat as read")),
    mute: (ms: number) => muteChat(s.uid, other, ms >= MUTE_FOREVER ? MUTE_FOREVER : Date.now() + ms).then(
      () => s.notify(ms >= MUTE_FOREVER ? `Muted ${name}` : `Muted ${name} ${MUTE_CHOICES.find((c) => c.ms === ms)?.label.toLowerCase() ?? ""}`.trim()),
      fail("mute this chat")),
    unmute: () => {
      local.setChatMuted(other, false); // older, device-only mute
      return muteChat(s.uid, other, null).then(() => s.notify(`Unmuted ${name}`), fail("unmute this chat"));
    },
    archive: (on: boolean) => archiveChat(s.uid, other, on).then(() => {
      s.notify(on ? "Chat archived. Find it under Archived chats in your account menu." : "Chat moved back to your messages");
      if (on) leaveIfOpen();
    }, fail(on ? "archive this chat" : "unarchive this chat")),
    askDelete: () => setPending("delete"),
    askBlock: () => setPending("block"),
    unblock: () => unblockPerson(s.uid, other).then(() => s.notify(`Unblocked ${name}`), fail("unblock")),
    receipts: (on: boolean) => setReadReceipts(s.uid, other, on).catch(fail("change read receipts")),
  };

  const dialogs: ReactNode = pending === "delete" ? (
    <ConfirmDialog title="Delete this chat?" confirmLabel="Delete chat" danger onCancel={() => setPending(null)}
      onConfirm={() => {
        setPending(null); onConfirmed?.();
        deleteChatForMe(s.uid, other).then(() => { s.notify("Chat deleted"); leaveIfOpen(); }, fail("delete this chat"));
      }}>
      <p>This clears the conversation with {name} from your messages. {name} keeps their copy, and a new message from either of you starts the chat again.</p>
    </ConfirmDialog>
  ) : pending === "block" ? (
    <ConfirmDialog title={`Block ${name}?`} confirmLabel="Block" danger onCancel={() => setPending(null)}
      onConfirm={() => {
        setPending(null); onConfirmed?.();
        blockPerson(s.uid, other).then(() => s.notify(`Blocked ${name}`), fail("block this person"));
      }}>
      <p>You and {name} will not be able to send each other messages. You stay friends, and you can unblock {name} any time from this chat.</p>
    </ConfirmDialog>
  ) : null;

  return { ...commands, dialogs };
}
