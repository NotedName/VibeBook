import { useEffect, useState } from "react";
import type { Entry } from "./entries";
import { copyText } from "./report";
import { removeRepost, repostId, saveRepost } from "./reposts";
import { useSession } from "./session";
import { postLink } from "./share";
import { PLATFORMS } from "./shareEntry";
import ShareFriendsPane from "./ShareFriendsPane";
import ShareGroupsPane from "./ShareGroupsPane";
import FormError from "./FormError";
import { ArrowLeftIcon, CheckIcon, CloseIcon, CopyIcon, GroupsIcon, MailIcon, MessagesIcon, RepostIcon, ShareIcon } from "./icons";
import { useScrollLock } from "./scrollLock";

type View = "menu" | "friends" | "groups";
const TITLES: Record<View, string> = { menu: "Share", friends: "Send to friends", groups: "Share to groups" };

/**
 * What pressing Share on a post opens, in this order:
 *   1. the link (copy it, or open the phone's share sheet)
 *   2. Repost: put someone else's public entry in your own logbook
 *   3. Send to friends: several friends at once, with a note if you like
 *   4. Share to groups: choose which of your groups it goes to
 *   5. Post the link on other platforms
 */
export default function ShareSheet({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const s = useSession();
  const ownerUid = entry.ownerUid ?? s.uid;
  const mine = ownerUid === s.uid;
  const vis = entry.visibility ?? "private";
  const isPublic = vis === "public";
  // A link only opens for people who are allowed to see the entry. Friends can open a Friends entry; only Public ones open for anyone.
  const sendable = isPublic || (mine && vis === "friends");
  const url = postLink(ownerUid, entry.id);
  const myRepost = s.reposts.get(repostId(ownerUid, entry.id));
  const [view, setView] = useState<View>("menu");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (view === "menu") onClose(); else setView("menu"); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, view]);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyLink() {
    if (await copyText(url)) { setCopied(true); s.notify("Link copied"); }
    else s.manualCopy(url);
  }

  async function nativeShare() {
    try { await navigator.share({ title: entry.title, url }); }
    catch (err) { if ((err as DOMException).name !== "AbortError") void copyLink(); }
  }

  async function toggleRepost() {
    setBusy(true);
    setError("");
    try {
      if (myRepost) { await removeRepost(s.uid, myRepost); s.notify("Repost removed"); }
      else { await saveRepost(s.uid, entry, [], undefined); s.notify("Reposted to your logbook"); }
      onClose();
    } catch {
      setError(myRepost ? "Could not remove the repost. Try again." : "Could not repost. Try again.");
      setBusy(false);
    }
  }

  const groupCount = (entry.groupIds ?? []).filter((id) => s.groups.ids.has(id)).length;
  const repostedGroups = myRepost ? myRepost.groupIds.filter((id) => s.groups.ids.has(id)).length : 0;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet share-sheet" role="dialog" aria-modal="true" aria-label={TITLES[view]}>
        <div className="sheet-head">
          {view !== "menu" && <button type="button" className="icon-btn sheet-back" aria-label="Back" onClick={() => setView("menu")}><ArrowLeftIcon /></button>}
          <h2>{TITLES[view]}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>

        {view === "friends" && <ShareFriendsPane entry={entry} ownerUid={ownerUid} onDone={onClose} />}
        {view === "groups" && <ShareGroupsPane entry={entry} ownerUid={ownerUid} onDone={onClose} />}

        {view === "menu" && (
          <div className="sheet-body">
            {/* 1. the link */}
            <section className="share-section" aria-label="Link">
              <h3>Link</h3>
              {isPublic ? (
                <>
                  <div className="share-link">
                    <input readOnly value={url} aria-label="Link to this entry" onFocus={(e) => e.currentTarget.select()} />
                    <button type="button" className="btn small primary" onClick={() => void copyLink()}>
                      {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy</>}
                    </button>
                  </div>
                  {canNativeShare && <button type="button" className="btn small" onClick={() => void nativeShare()}><ShareIcon /> Open share menu</button>}
                </>
              ) : (
                <p className="hint">{mine
                  ? "Set this entry to Public to share it with a link (Edit, then Who can see this)."
                  : "Only Public entries can be shared with a link."}</p>
              )}
            </section>

            <div className="action-list share-actions">
              {/* 2. repost */}
              {!mine && isPublic && (
                <button type="button" className={`action-row${myRepost ? " on" : ""}`} disabled={busy} onClick={() => void toggleRepost()}>
                  <i><RepostIcon /></i>
                  <span>
                    {myRepost ? "Undo repost" : "Repost"}
                    <small>{myRepost
                      ? repostedGroups > 0 ? `It is in your logbook and ${repostedGroups} ${repostedGroups === 1 ? "group" : "groups"}. Undoing removes both.` : "It is in your logbook."
                      : "Post it to your logbook"}</small>
                  </span>
                </button>
              )}
              {/* 3. friends */}
              <button type="button" className="action-row" disabled={!sendable} onClick={() => setView("friends")}>
                <i><MessagesIcon /></i>
                <span>Send to friends<small>{sendable ? "Pick one or more friends and add a message" : "Set this entry to Public or Friends so they can open it"}</small></span>
              </button>
              {/* 4. groups */}
              <button type="button" className="action-row" onClick={() => setView("groups")}>
                <i><GroupsIcon /></i>
                <span>Share to groups<small>{mine
                  ? groupCount > 0 ? `Shared to ${groupCount} ${groupCount === 1 ? "group" : "groups"}` : "Choose which groups can see it"
                  : "Also adds it to your logbook as a repost"}</small></span>
              </button>
            </div>
            {error && <FormError>{error}</FormError>}

            {/* 5. other platforms */}
            <section className="share-section" aria-label="Other platforms">
              <h3>Post to other platforms</h3>
              {isPublic ? (
                <ul className="share-platforms">
                  {PLATFORMS.map((p) => (
                    <li key={p.id}>
                      <a href={p.href(url, entry.title)} {...(p.id === "email" ? {} : { target: "_blank", rel: "noopener noreferrer" })} onClick={onClose}>
                        <i style={{ background: p.color }} aria-hidden="true">{p.id === "email" ? <MailIcon /> : p.mark}</i>
                        <span>{p.label}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Only Public entries can be posted to other platforms.</p>
              )}
            </section>
          </div>
        )}

        {view === "menu" && (
          <div className="sheet-actions"><button type="button" className="btn" onClick={onClose}>Close</button></div>
        )}
      </div>
    </div>
  );
}
