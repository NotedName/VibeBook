import { useCallback, useEffect } from "react";
import type { Member } from "./types";
import { useScrollLock } from "./scrollLock";
import PersonRow from "./PersonRow";
import RoleTiers from "./RoleTiers";
import { RowsSkeleton } from "./Skeleton";
import { CloseIcon, PlusIcon, SettingsIcon } from "./icons";

type Props = {
  members: Member[] | null;
  error: string;
  ownerUid: string;
  /** shown to people in the group */
  onInvite?: () => void;
  /** shown to admins and moderators */
  onManage?: () => void;
  onClose: () => void;
};

/**
 * The group's members behind a button, so they are one tap away on a phone instead of at the very bottom of a long feed.
 * Invite and Manage sit at the top, next to the list they act on.
 */
export default function GroupMembersSheet({ members, error, ownerUid, onInvite, onManage, onClose }: Props) {
  useScrollLock();
  const close = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet members-sheet" role="dialog" aria-modal="true" aria-label="Group members">
        <div className="sheet-head">
          <h2>Members{members && <span className="sheet-count">{members.length}</span>}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={close}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          {(onInvite || onManage) && (
            <div className="members-actions">
              {onInvite && <button type="button" className="btn primary" onClick={onInvite}><PlusIcon /> Invite</button>}
              {onManage && <button type="button" className="btn" onClick={onManage}><SettingsIcon /> Manage</button>}
            </div>
          )}
          {error && <p className="error note">{error}</p>}
          {!members && !error && <RowsSkeleton />}
          {members && <RoleTiers members={members} ownerUid={ownerUid} list="people" render={(m) => <PersonRow key={m.uid} uid={m.uid} />} />}
        </div>
      </div>
    </div>
  );
}
