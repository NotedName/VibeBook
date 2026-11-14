import { useGroup, useGroupMembers, withRoles } from "./groups";
import { ROLES, type GroupRole } from "./types";
import { useProfile } from "./session";
import { personHash } from "./profiles";
import Avatar from "./Avatar";

const roleLabel = (r: GroupRole) => ROLES.find((x) => x.id === r)!.label;

function Row({ uid, role }: { uid: string; role: GroupRole }) {
  const p = useProfile(uid);
  return (
    <li>
      <a href={personHash(uid, p)}>
        <Avatar profile={p} size="sm" />
        <span>{p === undefined ? "…" : p?.displayName || "VibeBook member"}</span>
        {role !== "member" && <i className={`role-badge role-${role}`}>{roleLabel(role)}</i>}
      </a>
    </li>
  );
}

/** The members of the group you are looking at, as a card in the right-hand column on wide screens. */
export default function GroupMembersCard({ gid }: { gid: string }) {
  const group = useGroup(gid);
  const { members, error } = useGroupMembers(gid);
  const list = members && group ? withRoles(members, group.ownerUid) : null;
  return (
    <section className="side-card side-members">
      <h2>Members {list && <span>{list.length}</span>}</h2>
      {error && <p className="error note">{error}</p>}
      {!list && !error && <p className="hint">Loading…</p>}
      {list && <ul>{list.map((m) => <Row key={m.uid} uid={m.uid} role={m.role} />)}</ul>}
    </section>
  );
}
