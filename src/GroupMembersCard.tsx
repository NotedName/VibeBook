import { useGroup, useGroupMembers, withRoles } from "./groups";
import { useProfile } from "./session";
import { personHash } from "./profiles";
import Avatar from "./Avatar";
import RoleTiers from "./RoleTiers";

function Row({ uid }: { uid: string }) {
  const p = useProfile(uid);
  return (
    <li>
      <a href={personHash(uid, p)}>
        <Avatar profile={p} size="sm" />
        <span>{p === undefined ? "…" : p?.displayName || "VibeBook member"}</span>
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
      {list && group && <RoleTiers members={list} ownerUid={group.ownerUid} list="tier-list" render={(m) => <Row key={m.uid} uid={m.uid} />} />}
    </section>
  );
}
