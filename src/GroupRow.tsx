import { useState } from "react";
import { joinGroup } from "./groups";
import { useSession } from "./session";
import type { Group } from "./types";

export function GroupAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return <div className={`gav gav-${size}`} aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "?"}</div>;
}

/** A group in a list: opens its page, and offers Join when you are not a member yet. */
export default function GroupRow({ group }: { group: Group }) {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  const member = s.groups.ids.has(group.id);

  async function join() {
    setBusy(true);
    try { await joinGroup(s.uid, group.id); s.notify(`Joined ${group.name}`); }
    catch { s.notify("That did not go through. Try again."); }
    finally { setBusy(false); }
  }

  return (
    <li className="person">
      <a href={`#/g/${encodeURIComponent(group.id)}`} className="person-link">
        <GroupAvatar name={group.name} />
        <span className="person-text">
          <b>{group.name}</b>
          {group.description && <span className="clamp">{group.description}</span>}
        </span>
      </a>
      {member ? <span className="vis">Joined</span> : (
        <button type="button" className="btn primary" disabled={busy} onClick={join}>Join</button>
      )}
    </li>
  );
}
