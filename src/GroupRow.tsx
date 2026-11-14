import { useState } from "react";
import { acceptInvite, cancelRequest, joinGroup, useMyRequest } from "./groups";
import JoinRequestSheet from "./JoinRequestSheet";
import { LockIcon } from "./icons";
import { useSession } from "./session";
import type { Group } from "./types";
import { firstChar } from "./text";

/** The group's picture when it has one, otherwise its first letter. */
export function GroupAvatar({ name, photo = "", size = "md" }: { name: string; photo?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`gav gav-${size}`} aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : firstChar(name).toUpperCase() || "?"}
    </div>
  );
}

/**
 * A group in a list: opens its page, and offers Join when you are not a member yet. A private group offers
 * "Ask to join" (or "Requested", which cancels the request) instead, unless you were invited.
 */
export default function GroupRow({ group }: { group: Group }) {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const member = s.groups.ids.has(group.id);
  const priv = group.privacy === "private";
  const invited = s.invites.some((i) => i.groupId === group.id);
  const request = useMyRequest(s.uid, group.id, priv && !member && !invited);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); s.notify(ok); }
    catch { s.notify("That did not go through. Try again."); }
    finally { setBusy(false); }
  }
  const join = () => run(() => (invited && priv ? acceptInvite(s.uid, group.id) : joinGroup(s.uid, group.id)), `Joined ${group.name}`);

  return (
    <li className="person">
      <a href={`#/g/${encodeURIComponent(group.id)}`} className="person-link">
        <GroupAvatar name={group.name} photo={group.avatar} />
        <span className="person-text">
          <b>{group.name}{priv && <span className="priv-tag" title="Private group"><LockIcon />Private</span>}</b>
          {group.description && <span className="clamp">{group.description}</span>}
        </span>
      </a>
      {member ? <span className="vis">Joined</span>
        : priv && !invited ? (
          request ? (
            <button type="button" className="btn" disabled={busy} title="Cancel your request"
              onClick={() => run(() => cancelRequest(s.uid, group.id), "Request cancelled")}>Requested</button>
          ) : (
            <button type="button" className="btn primary" disabled={busy || request === undefined} onClick={() => setAsking(true)}>Ask to join</button>
          )
        ) : <button type="button" className="btn primary" disabled={busy} onClick={join}>Join</button>}
      {asking && <JoinRequestSheet group={group} onClose={() => setAsking(false)} />}
    </li>
  );
}
