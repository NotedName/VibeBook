import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "./scrollLock";

/**
 * Links in text that other people wrote (descriptions, comments, messages).
 *
 *  - Only web addresses are ever made tappable: https://..., http://... and www.... Anything else (javascript:, data:, a
 *    file path) stays plain text.
 *  - A tappable link is a button, not an <a href>, so the warning cannot be skipped with a long press, a middle click or
 *    "open in new tab". Opening it always goes through the warning first.
 *  - The warning shows where the link really goes and points out the usual tricks (see linkFlags).
 *  - LinkNotice warns the author while they type a link into an entry.
 */

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Punctuation that ends a sentence, not an address: "see https://a.com/x." must not include the dot. */
function trimTail(raw: string): string {
  let s = raw;
  for (;;) {
    const last = s[s.length - 1];
    const count = (c: string) => s.split(c).length - 1;
    if (last && ".,;:!?'”’]}".includes(last)) s = s.slice(0, -1);
    else if (last === ")" && count(")") > count("(")) s = s.slice(0, -1);
    else return s;
  }
}

function toUrl(raw: string): URL | null {
  try {
    const u = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch { return null; }
}

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "rebrand.ly", "shorturl.at", "tiny.cc", "rb.gy", "t.ly", "lnkd.in", "s.id",
]);

/** The real VibeBook addresses. A name that only looks like VibeBook is a classic phishing trick. */
const OWN_HOSTS = ["vibebook.web.app", "vibebook.firebaseapp.com"];
const isOwnHost = (host: string) => OWN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

/** What is suspicious about an address, in words for the person. An empty list means nothing stood out, not that it is safe. */
export function linkFlags(u: URL): string[] {
  const out: string[] = [];
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (u.protocol === "http:") out.push("It is not encrypted (http, not https), so others on the network can read or change what you see.");
  if (u.username || u.password) out.push("The address has a username in it. That is a common trick to make a link look like another site.");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) out.push("The address is a number, not a website name.");
  if (host.split(".").some((label) => label.startsWith("xn--"))) out.push("The name uses look-alike letters that can imitate another site.");
  if (SHORTENERS.has(host)) out.push("It is a shortened link, so you cannot tell where it really goes.");
  if (/vibe-?book/.test(host) && !isOwnHost(host)) out.push("The name contains VibeBook, but this is not VibeBook's website.");
  if (u.port) out.push(`It uses an unusual port (${u.port}).`);
  return out;
}

type Part = string | { text: string; href: string };

/** The text cut into plain pieces and links, in order. */
export function splitLinks(text: string): Part[] {
  const out: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    if (start < last) continue;
    const raw = trimTail(m[0]);
    const u = toUrl(raw);
    if (!u) continue;
    if (start > last) out.push(text.slice(last, start));
    out.push({ text: raw, href: u.href });
    last = start + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export type FoundLink = { href: string; host: string; flags: string[] };

/** The different links in some text, at most `max`. */
export function linksIn(text: string, max = 5): FoundLink[] {
  const seen = new Set<string>();
  const found: FoundLink[] = [];
  for (const part of splitLinks(text)) {
    if (typeof part === "string" || seen.has(part.href) || found.length >= max) continue;
    seen.add(part.href);
    const u = new URL(part.href);
    found.push({ href: part.href, host: u.host, flags: linkFlags(u) });
  }
  return found;
}

/** The warning shown before a link opens. Go back is the first, safe choice; Escape and a tap outside also go back. */
function LinkWarning({ href, onClose }: { href: string; onClose: () => void }) {
  useScrollLock();
  const id = useId();
  const u = useMemo(() => new URL(href), [href]);
  const flags = useMemo(() => linkFlags(u), [u]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="overlay center" onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }} onClick={(e) => e.stopPropagation()}>
      <div className="confirm-dialog link-warning" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <h2 id={`${id}-t`}>You are leaving VibeBook</h2>
        <div className="confirm-body">
          <p>This link goes to <b>{u.host}</b>. VibeBook cannot check what is on the other side.</p>
          <code className="link-url">{u.href.length > 300 ? `${u.href.slice(0, 300)}…` : u.href}</code>
          {flags.length > 0 && (
            <ul className="link-flags">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
          )}
          <p>Only open it if you trust whoever shared it. Never type your password or a code on a page you reached from a link.</p>
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn primary" autoFocus onClick={onClose}>Go back</button>
          <a className={`btn${flags.length > 0 ? " danger" : ""}`} href={u.href} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={onClose}>
            Open link
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The text with its web addresses made tappable. `plain` draws the pieces between the links (for example with a search
 * match marked); by default they are drawn as they are.
 */
export function Linkified({ text, plain }: { text: string; plain?: (piece: string) => ReactNode }) {
  const [open, setOpen] = useState("");
  const parts = useMemo(() => splitLinks(text), [text]);
  return (
    <>
      {parts.map((p, i) => typeof p === "string"
        ? <Fragment key={i}>{plain ? plain(p) : p}</Fragment>
        : (
          <button key={i} type="button" className="safe-link" title="Opens after a safety warning"
            onClick={(e) => { e.stopPropagation(); setOpen(p.href); }}>{p.text}</button>
        ))}
      {open && <LinkWarning href={open} onClose={() => setOpen("")} />}
    </>
  );
}

/**
 * Shown under a text box in the entry form when the text contains a link. `where` says what kind of text it is: an activity
 * (its title) cannot be tapped, a description can.
 */
export function LinkNotice({ text, where }: { text: string; where: "activity" | "description" }) {
  const found = useMemo(() => linksIn(text), [text]);
  if (found.length === 0) return null;
  const risky = found.filter((l) => l.flags.length > 0);
  return (
    <div className={`link-note${risky.length > 0 ? " risky" : ""}`} role="note">
      <b>{found.length === 1 ? "This text contains a link" : `This text contains ${found.length} links`}</b>
      <p>
        {where === "activity"
          ? "A link in the activity cannot be opened from the post. Put it in the description instead, where readers get a safety warning before it opens."
          : "Readers get a safety warning before a link opens. Only add links you trust, and keep private details such as passwords or personal codes out of them."}
      </p>
      {risky.length > 0 && (
        <ul>{risky.map((l) => <li key={l.href}><b>{l.host}</b>: {l.flags.join(" ")}</li>)}</ul>
      )}
    </div>
  );
}
