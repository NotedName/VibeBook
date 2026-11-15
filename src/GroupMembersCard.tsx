import { useState } from "react";
import { createPortal } from "react-dom";
import { RowsSkeleton } from "./Skeleton";
import { useGroup, useGroupMembers, withRoles } from "./groups";
import { useProfile, useSession } from "./session";
import { personHash } from "./profiles";
import Avatar from "./Avatar";
import RoleTiers from "./RoleTiers";
import GroupMembersSheet from "./GroupMembersSheet";
import { SettingsIcon } from "./icons";

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

/**
 * The members of the group you are looking at, as a card in the right-hand column on wide screens.
 * Admins and moderators get a Manage button that opens the Members popup in Manage mode (roles, removing people).
 */
export default function GroupMembersCard({ gid }: { gid: string }) {
  const s = useSession();
  const group = useGroup(gid);
  const { members, error } = useGroupMembers(gid);
  const [managing, setManaging] = useState(false);
  const list = members && group ? withRoles(members, group.ownerUid) : null;
  const myRole = list && s.groups.ids.has(gid) ? (list.find((m) => m.uid === s.uid)?.role ?? "member") : null;
  const canManage = myRole === "admin" || myRole === "moderator";
  return (
    <section className="side-card side-members">
      <h2>
        Members {list && <span>{list.length}</span>}
        {canManage && (
          <button type="button" className="btn small side-manage" onClick={() => setManaging(true)} title="Manage members">
            <SettingsIcon /> Manage
          </button>
        )}
      </h2>
      {error && <p className="error note">{error}</p>}
      {!list && !error && <RowsSkeleton />}
      {list && group && <RoleTiers members={list} ownerUid={group.ownerUid} list="tier-list" render={(m) => <Row key={m.uid} uid={m.uid} />} />}
      {managing && list && group && createPortal(
        <GroupMembersSheet gid={gid} members={list} error={error} ownerUid={group.ownerUid} myRole={myRole} startManaging
          onClose={() => setManaging(false)} />,
        document.body,
      )}
    </section>
  );
}
