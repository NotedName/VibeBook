import { useProfile, useSession } from "./session";
import { useNotes } from "./notifications";
import { useClosestFriends } from "./closeFriends";
import { personHash } from "./profiles";
import Avatar from "./Avatar";
import { GroupAvatar } from "./GroupRow";
import { PlusIcon } from "./icons";

function SideFriend({ uid }: { uid: string }) {
  const p = useProfile(uid);
  return (
    <li>
      <a href={personHash(uid, p)}><Avatar profile={p} size="sm" /><span>{p === undefined ? "…" : p?.displayName || "VibeBook member"}</span></a>
    </li>
  );
}

/** Shortcuts shown beside the page on wide screens. Hidden on phones and tablets by CSS. */
export default function SideColumn({ onNewEntry }: { onNewEntry: () => void }) {
  const s = useSession();
  const groups = s.groups.list.slice(0, 6);
  const notes = useNotes(s.uid);
  const closest = useClosestFriends(s.uid, s.friends, notes, 5);
  return (
    <aside className="side" aria-label="Shortcuts">
      <button type="button" className="btn primary wide" onClick={onNewEntry}><PlusIcon /> New entry</button>

      {(s.invites.length > 0 || s.incoming.length > 0) && (
        <section className="side-card">
          <h2>Waiting for you</h2>
          <ul>
            {s.incoming.length > 0 && (
              <li><a href="#/people">Friend requests <i className="badge">{s.incoming.length}</i></a></li>
            )}
            {s.invites.length > 0 && (
              <li><a href="#/groups">Group invitations <i className="badge">{s.invites.length}</i></a></li>
            )}
          </ul>
        </section>
      )}

      <section className="side-card">
        <h2>Your groups</h2>
        {groups.length === 0 ? (
          <p className="hint">You have not joined any groups yet.</p>
        ) : (
          <ul>
            {groups.map((g) => (
              <li key={g.id}>
                <a href={`#/g/${encodeURIComponent(g.id)}`}><GroupAvatar name={g.name} size="sm" /><span>{g.name}</span></a>
              </li>
            ))}
          </ul>
        )}
        <a className="btn wide" href="#/groups">{s.groups.list.length > groups.length ? `See all ${s.groups.list.length} groups` : "Find or create a group"}</a>
      </section>

      <section className="side-card">
        <h2>Friends <span>{s.friends.size}</span></h2>
        {closest.length === 0 ? (
          <p className="hint">You have not added any friends yet.</p>
        ) : (
          <ul>{closest.map((id) => <SideFriend key={id} uid={id} />)}</ul>
        )}
        <a className="btn wide" href="#/people">Find people</a>
      </section>
    </aside>
  );
}
