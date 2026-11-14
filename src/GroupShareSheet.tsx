import { useEffect, useState, type FormEvent } from "react";
import { setEntryGroups, type Entry } from "./entries";
import { AlreadyInGroupError, removeRepost, repostId, saveRepost } from "./reposts";
import { groupsHoldingEntry } from "./groups";
import { useSession } from "./session";
import { MAX_GROUPS_PER_ENTRY } from "./types";
import { GroupAvatar } from "./GroupRow";
import { CloseIcon } from "./icons";
import { useScrollLock } from "./scrollLock";

type Props = {
  /** "own" shares your own entry to groups; "repost" reposts someone else's public entry. */
  kind: "own" | "repost";
  entry: Entry;
  onClose: () => void;
};

export default function GroupShareSheet({ kind, entry, onClose }: Props) {
  const s = useSession();
  const existing = kind === "repost" ? s.reposts.get(repostId(entry.ownerUid!, entry.id)) : undefined;
  const [groupIds, setGroupIds] = useState<string[]>(
    () => (kind === "own" ? entry.groupIds ?? [] : existing?.groupIds ?? []).filter((id) => s.groups.ids.has(id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Reposting: groups that already have this post (the original, or someone's repost) cannot be picked. null while checking.
  const [taken, setTaken] = useState<Set<string> | null>(kind === "repost" ? null : new Set());
  const groupKey = s.groups.list.map((g) => g.id).join(",");
  useEffect(() => {
    if (kind !== "repost") return;
    let live = true;
    groupsHoldingEntry(groupKey ? groupKey.split(",") : [], entry.ownerUid!, entry.id, s.uid).then(
      (t) => { if (!live) return; setTaken(t); setGroupIds((p) => p.filter((g) => !t.has(g))); },
      () => { if (live) setTaken(new Set()); }, // the save itself checks again
    );
    return () => { live = false; };
  }, [kind, groupKey, entry.ownerUid, entry.id, s.uid]);

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const toggle = (id: string) => setGroupIds((p) => (p.includes(id) ? p.filter((g) => g !== id) : [...p, id]));

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError("");
    try { await fn(); s.notify(ok); onClose(); }
    catch (err) {
      setError(err instanceof AlreadyInGroupError
        ? "One of those groups already has this post. It can only be in a group once."
        : "That did not go through. Try again.");
      if (err instanceof AlreadyInGroupError) setTaken((p) => new Set([...(p ?? []), ...err.groupIds]));
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (kind === "own") {
      // keep groups the entry is in but that this person has left, so nothing is silently dropped
      const kept = (entry.groupIds ?? []).filter((id) => !s.groups.ids.has(id));
      return run(() => setEntryGroups(s.uid, entry, [...kept, ...groupIds]), "Sharing updated");
    }
    const kept = (existing?.groupIds ?? []).filter((id) => !s.groups.ids.has(id));
    return run(() => saveRepost(s.uid, entry, [...kept, ...groupIds], existing), existing ? "Repost updated" : "Reposted to your logbook");
  }

  const title = kind === "own" ? "Share to groups" : existing ? "Your repost" : "Repost";
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <p className="hint">
            {kind === "own"
              ? "Members of the groups you tick can see and comment on this entry, whatever its visibility."
              : `"${entry.title}" is added to your logbook and shown to people who see your reposts. Tick groups to share it there too.`}
          </p>
          {kind === "own" && groupIds.some((id) => s.groups.list.find((g) => g.id === id)?.privacy === "private") && (
            <p className="hint unsaved">A private group is ticked. Only its members will see this entry: it comes off your profile, the feed and its share link, and visitors see "join the group to see this post".</p>
          )}
          <fieldset className="group-pick">
            <legend>Groups</legend>
            {s.groups.list.length === 0 ? (
              <div className="empty-groups"><p className="hint">You have not joined any groups yet.</p><a className="btn small primary" href="#/groups" onClick={onClose}>Find or create a group</a></div>
            ) : (
              <ul>
                {s.groups.list.map((g) => {
                  const on = groupIds.includes(g.id);
                  const has = taken?.has(g.id) ?? false;
                  return (
                    <li key={g.id}>
                      <label className={`${on ? "on" : ""}${has ? " off" : ""}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(g.id)}
                          disabled={has || (!on && groupIds.length >= MAX_GROUPS_PER_ENTRY)} />
                        <GroupAvatar name={g.name} photo={g.avatar} size="sm" />
                        <span>{g.name}</span>
                        {has && <small className="invite-status">Already in this group</small>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="hint">Up to {MAX_GROUPS_PER_ENTRY} groups.{kind === "repost" && " A post can only be in a group once, so groups that already have it are greyed out."}</p>
          </fieldset>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <div className="sheet-actions">
          {existing
            ? <button type="button" className="btn" disabled={busy} onClick={() => run(() => removeRepost(s.uid, existing), "Repost removed")}>Undo repost</button>
            : <button type="button" className="btn" onClick={onClose}>Cancel</button>}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : kind === "own" ? "Save" : existing ? "Save" : "Repost"}
          </button>
        </div>
      </form>
    </div>
  );
}
