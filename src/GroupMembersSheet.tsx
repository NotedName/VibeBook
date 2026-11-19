import { Requests } from "./GroupManageSheet";
import type { Group } from "./types";
import { useCallback, useEffect, useState } from "react";
import type { GroupRole, Member } from "./types";
import { useBannedUids } from "./groups";
import { useScrollLock } from "./scrollLock";
import PersonRow from "./PersonRow";
import RoleTiers from "./RoleTiers";
import { MemberRow, RemovedRow } from "./MemberManage";
import { RowsSkeleton } from "./Skeleton";
import { CloseIcon, PlusIcon, SettingsIcon } from "./icons";

type Props = {
  gid: string;
  /** needed to show the join requests while managing a private group */
  group?: Group;
  members: Member[] | null;
  error: string;
  ownerUid: string;
  /** the signed-in person's role: admins and moderators get the Manage button */
  myRole?: GroupRole | null;
  /** open straight in Manage mode (the Manage button beside the members on wide screens) */
  startManaging?: boolean;
  /** shown to people in the group */
  onInvite?: () => void;
  onClose: () => void;
};

/**
 * The group's members behind a button, so they are one tap away on a phone instead of at the very bottom of a long feed.
 * Admins and moderators can switch it to Manage mode: each person then shows their role and a Remove button, and people who
 * were removed are listed below with "Allow back" for admins.
 */
export default function GroupMembersSheet({ gid, group, members, error, ownerUid, myRole, startManaging, onInvite, onClose }: Props) {
  const canManage = myRole === "admin" || myRole === "moderator";
  const [managing, setManaging] = useState(!!startManaging && canManage);
  const banned = useBannedUids(gid, canManage && managing);
  useScrollLock();
  const close = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet members-sheet" role="dialog" aria-modal="true" aria-label={managing ? "Manage members" : "Group members"}>
        <div className="sheet-head">
          <h2>{managing ? "Manage members" : "Members"}{members && <span className="sheet-count">{members.length}</span>}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={close}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          {(onInvite || (canManage && !managing)) && (
            <div className="members-actions">
              {onInvite && <button type="button" className="btn primary" onClick={onInvite}><PlusIcon /> Invite</button>}
              {canManage && !managing && (
                <button type="button" className="btn" onClick={() => setManaging(true)}><SettingsIcon /> Manage</button>
              )}
            </div>
          )}
          {managing && group && <Requests group={group} />}
          {managing && <p className="hint">Change a role or remove someone. Removed people cannot rejoin until an admin allows it.</p>}
          {error && <p className="error note">{error}</p>}
          {!members && !error && <RowsSkeleton />}
          {members && (managing && myRole ? (
            <RoleTiers members={members} ownerUid={ownerUid} list="people"
              render={(m) => <MemberRow key={m.uid} gid={gid} member={m} myRole={myRole} ownerUid={ownerUid} />} />
          ) : (
            <RoleTiers members={members} ownerUid={ownerUid} list="people" render={(m) => <PersonRow key={m.uid} uid={m.uid} />} />
          ))}
          {managing && banned.length > 0 && (
            <section className="manage-section">
              <h3>Removed <span>{banned.length}</span></h3>
              <ul className="people">{banned.map((u) => <RemovedRow key={u} gid={gid} uid={u} canAllow={myRole === "admin"} />)}</ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
