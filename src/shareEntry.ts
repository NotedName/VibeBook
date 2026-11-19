import type { Entry } from "./entries";
import { failureReason, MESSAGE_MAX, sendMessage } from "./messages";
import { postLink } from "./share";

/** Longest note a person can add when sending an entry to friends. */
export const NOTE_MAX = 500;
/** Friends an entry can be sent to at once (messages are also limited to 20 per 30 seconds, see rateLimit.ts). */
export const MAX_RECIPIENTS = 15;

/** The text of the message a friend gets: the person's note (if any), then the entry's title and its link. */
export function entryMessage(entry: Entry, url: string, note: string): string {
  const body = `${entry.title.trim()}\n${url}`;
  const lead = note.trim().slice(0, NOTE_MAX);
  return (lead ? `${lead}\n\n${body}` : body).slice(0, MESSAGE_MAX);
}

/**
 * Sends a link to an entry (with an optional note) to each friend, as an ordinary chat message. Each friend is tried on their own,
 * so one who cannot receive it does not stop the rest.
 */
export async function sendEntryToFriends(
  me: string, ownerUid: string, entry: Entry, note: string, to: { uid: string; first?: { friend: boolean } }[],
) {
  const text = entryMessage(entry, postLink(ownerUid, entry.id), note);
  const sent: string[] = [];
  const failed: { uid: string; reason: string }[] = [];
  for (const t of to) {
    try { await sendMessage(me, t.uid, { text }, t.first); sent.push(t.uid); }
    catch (err) { failed.push({ uid: t.uid, reason: failureReason(err) }); }
  }
  return { sent, failed };
}

/** Other places to post a link. Each opens that site's own share page in a new tab, with the link filled in. */
export type Platform = { id: string; label: string; mark: string; color: string; href: (url: string, title: string) => string };
const enc = encodeURIComponent;
export const PLATFORMS: Platform[] = [
  { id: "whatsapp", label: "WhatsApp", mark: "W", color: "#25d366", href: (u, t) => `https://wa.me/?text=${enc(`${t} ${u}`)}` },
  { id: "facebook", label: "Facebook", mark: "f", color: "#1877f2", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}` },
  { id: "x", label: "X", mark: "X", color: "#111111", href: (u, t) => `https://twitter.com/intent/tweet?url=${enc(u)}&text=${enc(t)}` },
  { id: "telegram", label: "Telegram", mark: "T", color: "#229ed9", href: (u, t) => `https://t.me/share/url?url=${enc(u)}&text=${enc(t)}` },
  { id: "linkedin", label: "LinkedIn", mark: "in", color: "#0a66c2", href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(u)}` },
  { id: "email", label: "Email", mark: "@", color: "#6b6577", href: (u, t) => `mailto:?subject=${enc(t)}&body=${enc(`${t}\n${u}`)}` },
];

/**
 * A shared entry is an ordinary text message ("note", blank line, title, link). The chat recognises it by its last two lines, a title
 * and a post link, and draws a card for it instead of a link, as Messenger does for shared posts. Older messages work the same way.
 */
export function parseSharedEntry(text: string): { note: string; title: string; uid: string; id: string } | null {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const link = lines[lines.length - 1].trim();
  const m = link.match(/#\/p\/([^/\s]+)\/([^/\s]+)$/);
  if (!m) return null;
  try {
    const title = lines[lines.length - 2].trim();
    if (!title) return null;
    return { note: lines.slice(0, -2).join("\n").trim(), title, uid: decodeURIComponent(m[1]), id: decodeURIComponent(m[2]) };
  } catch { return null; }
}
