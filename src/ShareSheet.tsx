import { useEffect, useState, type FormEvent } from "react";
import { setEntryGroups, type Entry } from "./entries";
import { useSession } from "./session";
import { MAX_GROUPS_PER_ENTRY } from "./types";
import { GroupAvatar } from "./GroupRow";
import { CloseIcon, ShareIcon } from "./icons";
import { useScrollLock } from "./scrollLock";
import FormError from "./FormError";

type Props = {
  entry: Entry;
  /** Whether the entry can be opened by link (it is Public). */
  linkable: boolean;
  /** Copies the link, or opens the phone's share sheet. */
  onLink: () => Promise<void>;
  onClose: () => void;
};

/**
 * What pressing Share on a post opens: send a link to it and, on your own entries, choose which
 * groups it is shared to (members of those groups can see and comment on it, whatever its visibility).
 */
export default function ShareSheet({ entry, linkable, onLink, onClose }: Props) {
  const s = useSession();
  const mine = (entry.ownerUid ?? s.uid) === s.uid;
  const [groupIds, setGroupIds] = useState<string[]>(() => (entry.groupIds ?? []).filter((id) => s.groups.ids.has(id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const toggle = (id: string) => setGroupIds((p) => (p.includes(id) ? p.filter((g) => g !== id) : [...p, id]));
  const kept = (entry.groupIds ?? []).filter((id) => !s.groups.ids.has(id)); // groups you have left stay as they were
  const changed = [...groupIds].sort().join() !== (entry.groupIds ?? []).filter((id) => s.groups.ids.has(id)).sort().join();

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await setEntryGroups(s.uid, entry, [...kept, ...groupIds]);
      s.notify("Sharing updated");
      onClose();
    } catch {
      setError("That did not go through. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label="Share" onSubmit={save}>
        <div className="sheet-head">
          <h2>Share</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <section className="share-block">
            <h3>Send a link</h3>
            {linkable ? (
              <button type="button" className="btn primary" onClick={() => onLink().then(onClose)}><ShareIcon /> Copy or share link</button>
            ) : (
              <p className="hint">{mine
                ? "Set this entry to Public to share it with a link (Edit, then Who can see this)."
                : "Only Public entries can be shared with a link."}</p>
            )}
          </section>

          {mine ? (
            <fieldset className="group-pick">
              <legend>Share to groups</legend>
              {s.groups.list.length === 0 ? (
                <div className="empty-groups"><p className="hint">You have not joined any groups yet.</p><a className="btn small primary" href="#/groups" onClick={onClose}>Find or create a group</a></div>
              ) : (
                <>
                  <ul>
                    {s.groups.list.map((g) => {
                      const on = groupIds.includes(g.id);
                      return (
                        <li key={g.id}>
                          <label className={on ? "on" : ""}>
                            <input type="checkbox" checked={on} onChange={() => toggle(g.id)}
                              disabled={!on && groupIds.length >= MAX_GROUPS_PER_ENTRY} />
                            <GroupAvatar name={g.name} photo={g.avatar} size="sm" />
                            <span>{g.name}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="hint">
                    Members of the groups you tick can see and comment on this entry, whatever you chose for
                    who can see it. Up to {MAX_GROUPS_PER_ENTRY} groups.
                  </p>
                </>
              )}
            </fieldset>
          ) : (
            <p className="hint">Use Repost to add this entry to your logbook and to your groups.</p>
          )}
          {error && <FormError>{error}</FormError>}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>{mine && changed ? "Cancel" : "Close"}</button>
          {mine && s.groups.list.length > 0 && (
            <button type="submit" className="btn primary" disabled={busy || !changed}>{busy ? "Saving…" : "Save"}</button>
          )}
        </div>
      </form>
    </div>
  );
}
