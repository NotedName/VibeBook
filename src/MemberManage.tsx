import { useEffect, useState } from "react";
import { allowBack, canChangeRole, canRemove, removeMember, setMemberRole } from "./groups";
import { ROLES, type GroupRole, type Member } from "./types";
import { useProfile, useSession } from "./session";
import { personHash } from "./profiles";
import Avatar from "./Avatar";

// Who is in a group and what an admin or moderator can do to each person: change a role, remove, or let a removed person back.
// These rows live in the Members popup (GroupMembersSheet), in its "Manage" mode.

const roleLabel = (r: GroupRole) => ROLES.find((x) => x.id === r)!.label;

/** Run an action with a busy flag, and tell the person how it went. */
export function useAction() {
  const { notify } = useSession();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); notify(ok); }
    catch { notify("That did not go through. Try again."); }
    finally { setBusy(false); }
  }
  return { busy, run };
}

export function MemberRow({ gid, member, myRole, ownerUid }: { gid: string; member: Member; myRole: GroupRole; ownerUid: string }) {
  const s = useSession();
  const p = useProfile(member.uid);
  const { busy, run } = useAction();
  const [armed, setArmed] = useState(false);
  /** a role picked in the list but not yet confirmed */
  const [pending, setPending] = useState<GroupRole | null>(null);
  const name = p === undefined ? "…" : p?.displayName || "VibeBook member";
  const changeRole = canChangeRole(myRole, member, ownerUid, s.uid);
  const removable = canRemove(myRole, member, ownerUid, s.uid);

  useEffect(() => {
    if (!armed && !pending) return;
    const t = setTimeout(() => { setArmed(false); setPending(null); }, 3500);
    return () => clearTimeout(t);
  }, [armed, pending]);

  return (
    <li className="person member-row">
      <a href={personHash(member.uid, p)} className="person-link">
        <Avatar profile={p} size="md" />
        <span className="person-text">
          <b>{name}{member.uid === s.uid && " (you)"}</b>
          <span>{member.uid === ownerUid ? "Owner · Admin" : roleLabel(member.role)}</span>
        </span>
      </a>
      {(changeRole || removable) && (
      <div className="member-actions">
        {changeRole && (
          <select className="role-select" aria-label={`Role for ${name}`} value={pending ?? member.role} disabled={busy}
            onChange={(e) => {
              const role = e.target.value as GroupRole;
              setArmed(false);
              setPending(role === member.role ? null : role);
            }}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        )}
        {pending && (
          <button type="button" className="btn primary" disabled={busy}
            onClick={async () => {
              await run(() => setMemberRole(gid, member.uid, pending), `${name} is now ${roleLabel(pending).toLowerCase()}`);
              setPending(null);
            }}>
            Confirm
          </button>
        )}
        {removable && !pending && (
          <button type="button" className={`btn${armed ? " armed" : ""}`} disabled={busy}
            onClick={() => (armed ? run(() => removeMember(gid, member.uid, s.uid), `${name} was removed`) : setArmed(true))}>
            {armed ? "Tap to confirm" : "Remove"}
          </button>
        )}
      </div>
      )}
    </li>
  );
}

export function RemovedRow({ gid, uid, canAllow }: { gid: string; uid: string; canAllow: boolean }) {
  const p = useProfile(uid);
  const { busy, run } = useAction();
  const name = p === undefined ? "…" : p?.displayName || "VibeBook member";
  return (
    <li className="person member-row">
      <span className="person-link">
        <Avatar profile={p} size="md" />
        <span className="person-text"><b>{name}</b><span>Cannot rejoin</span></span>
      </span>
      {canAllow && (
        <div className="member-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => allowBack(gid, uid), `${name} can rejoin`)}>
            Allow back
          </button>
        </div>
      )}
    </li>
  );
}
