import { useEffect, useState } from "react";
import { setEntryGroups, type Entry } from "./entries";
import { AlreadyInGroupError, repostId, saveRepost } from "./reposts";
import { groupsHoldingEntry } from "./groups";
import { useSession } from "./session";
import { MAX_GROUPS_PER_ENTRY } from "./types";
import { GroupAvatar } from "./GroupRow";
import FormError from "./FormError";

/**
 * Choose which of your groups an entry is shared to. On your own entry that decides who can see and comment on it. On someone
 * else's public entry it reposts it (it is added to your logbook as a repost) and shares the repost to the groups you tick.
 */
export default function ShareGroupsPane({ entry, ownerUid, onDone }: { entry: Entry; ownerUid: string; onDone: () => void }) {
  const s = useSession();
  const mine = ownerUid === s.uid;
  const existing = mine ? undefined : s.reposts.get(repostId(ownerUid, entry.id));
  const [groupIds, setGroupIds] = useState<string[]>(
    () => (mine ? entry.groupIds ?? [] : existing?.groupIds ?? []).filter((id) => s.groups.ids.has(id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Someone else's entry: groups that already have it (the original, or any repost of it) cannot be picked. null while checking.
  const [taken, setTaken] = useState<Set<string> | null>(mine ? new Set() : null);
  const groupKey = s.groups.list.map((g) => g.id).join(",");
  useEffect(() => {
    if (mine) return;
    let live = true;
    groupsHoldingEntry(groupKey ? groupKey.split(",") : [], ownerUid, entry.id, s.uid).then(
      (t) => { if (!live) return; setTaken(t); setGroupIds((p) => p.filter((g) => !t.has(g) || existing?.groupIds.includes(g))); },
      () => { if (live) setTaken(new Set()); }, // saving checks again
    );
    return () => { live = false; };
  }, [mine, groupKey, ownerUid, entry.id, s.uid, existing]);

  const toggle = (id: string) => setGroupIds((p) => (p.includes(id) ? p.filter((g) => g !== id) : [...p, id]));
  const held = (existing?.groupIds ?? []).filter((id) => s.groups.ids.has(id));
  const original = mine ? (entry.groupIds ?? []).filter((id) => s.groups.ids.has(id)) : held;
  const changed = [...groupIds].sort().join() !== [...original].sort().join();

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (mine) {
        const kept = (entry.groupIds ?? []).filter((id) => !s.groups.ids.has(id)); // groups you have left stay as they were
        await setEntryGroups(s.uid, entry, [...kept, ...groupIds]);
        s.notify("Sharing updated");
      } else {
        const kept = (existing?.groupIds ?? []).filter((id) => !s.groups.ids.has(id));
        await saveRepost(s.uid, entry, [...kept, ...groupIds], existing);
        s.notify(existing ? "Repost updated" : groupIds.length ? "Shared to your groups and reposted to your logbook" : "Reposted to your logbook");
      }
      onDone();
    } catch (err) {
      if (err instanceof AlreadyInGroupError) {
        setTaken((p) => new Set([...(p ?? []), ...err.groupIds]));
        setGroupIds((p) => p.filter((g) => !err.groupIds.includes(g)));
        setError("One of those groups already has this post, so it was unticked. A post can only be in a group once.");
      } else setError("That did not go through. Try again.");
      setBusy(false);
    }
  }

  const privatePicked = mine && groupIds.some((id) => s.groups.list.find((g) => g.id === id)?.privacy === "private");
  return (
    <>
      <div className="sheet-body">
        <p className="hint">
          {mine
            ? "Members of the groups you tick can see and comment on this entry, whatever its visibility."
            : `“${entry.title}” is shown in the groups you tick. Sharing it to a group also adds it to your logbook as a repost.`}
        </p>
        {privatePicked && (
          <p className="hint unsaved">A private group is ticked: only its members will see this entry. It leaves your profile, the feed and its share link.</p>
        )}
        <fieldset className="group-pick">
          <legend>Groups</legend>
          {s.groups.list.length === 0 ? (
            <div className="empty-groups"><p className="hint">You have not joined any groups yet.</p><a className="btn small primary" href="#/groups" onClick={onDone}>Find or create a group</a></div>
          ) : (
            <ul>
              {s.groups.list.map((g) => {
                const on = groupIds.includes(g.id);
                const has = (taken?.has(g.id) ?? false) && !existing?.groupIds.includes(g.id);
                return (
                  <li key={g.id}>
                    <label className={`${on ? "on" : ""}${has ? " off" : ""}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(g.id)} disabled={has || (!on && groupIds.length >= MAX_GROUPS_PER_ENTRY)} />
                      <GroupAvatar name={g.name} photo={g.avatar} size="sm" />
                      <span>{g.name}</span>
                      {has && <small className="invite-status">Already in this group</small>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="hint">Up to {MAX_GROUPS_PER_ENTRY} groups.{!mine && " Groups that already have it are greyed out."}</p>
        </fieldset>
        {error && <FormError>{error}</FormError>}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onDone} disabled={busy}>Cancel</button>
        {s.groups.list.length > 0 && (
          <button type="button" className="btn primary" disabled={busy || taken === null || (!changed && (mine || !!existing))} onClick={() => void save()}>
            {busy ? "Saving…" : mine || existing ? "Save" : "Share"}
          </button>
        )}
      </div>
    </>
  );
}
