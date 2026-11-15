import { useEffect, useMemo, useState } from "react";
import { acceptInvite, cancelRequest, joinGroup, leaveGroup, useGroup, useGroupMembers, useMyRequest, withRoles } from "../groups";
import JoinRequestSheet from "../JoinRequestSheet";
import { useGroupEntries } from "../groupFeed";
import { useSession } from "../session";
import { dateDir, useSortedEntries, useSortMode } from "../sorting";
import SortMenu from "../SortMenu";
import { ROLES, type GroupRole } from "../types";
import EntryList from "../EntryList";
import { GroupAvatar } from "../GroupRow";
import InviteSheet from "../InviteSheet";
import GroupMembersSheet from "../GroupMembersSheet";
import GroupManageSheet from "../GroupManageSheet";
import ImageViewer from "../ImageViewer";
import { FeedSkeleton, GroupHeadSkeleton } from "../Skeleton";
import { LockIcon, LogOutIcon, PlusIcon, SettingsIcon, UsersIcon } from "../icons";

const roleLabel = (r: GroupRole) => ROLES.find((x) => x.id === r)!.label;
const RoleBadge = ({ role }: { role: GroupRole }) => role === "member" ? null : <span className={`role-badge role-${role}`}>{roleLabel(role)}</span>;

function GroupFeed({ gid, name, canModerate }: { gid: string; name: string; canModerate: boolean }) {
  const s = useSession();
  const [mode, setMode] = useSortMode("group");
  const { entries: loaded, loading, error } = useGroupEntries(gid, 40, dateDir(mode));
  const entries = useSortedEntries(loaded, mode);
  return (
    <>
      <div className="composer">
        <button type="button" className="composer-input" onClick={() => s.openEntry(null, gid)}>
          Share an entry with {name}…
        </button>
        <SortMenu mode={mode} onChange={setMode} />
      </div>
      <div className="feed" aria-live="polite">
        {error && <p className="error note" role="alert">{error}</p>}
        {loading && entries.length === 0 && <FeedSkeleton />}
        {!loading && entries.length === 0 && !error && (
          <div className="empty">
            <h2>Nothing shared yet</h2>
            <p>Entries that members share with this group show up here. Be the first.</p>
          </div>
        )}
        <EntryList entries={entries} onEdit={s.openEntry} inGroup={{ id: gid, canModerate }}
          dayHeadings={mode.kind === "newest" || mode.kind === "oldest"} />
      </div>
    </>
  );
}

export default function GroupPage({ gid }: { gid: string }) {
  const s = useSession();
  const group = useGroup(gid);
  const { members: stored, error: membersError } = useGroupMembers(gid);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [managing, setManaging] = useState(false);
  const [listing, setListing] = useState(false);
  const [viewing, setViewing] = useState<"avatar" | "cover" | null>(null);
  const [asking, setAsking] = useState(false);
  const member = s.groups.ids.has(gid);
  const invited = s.invites.some((i) => i.groupId === gid);
  const request = useMyRequest(s.uid, gid, group?.privacy === "private" && !member && !invited);
  const { markGroupSeen } = s;

  // Looking at a group clears its "new posts" alert, on the way in and on the way out.
  useEffect(() => {
    markGroupSeen(gid);
    return () => markGroupSeen(gid);
  }, [gid, markGroupSeen]);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  const members = useMemo(() => (stored && group ? withRoles(stored, group.ownerUid) : null), [stored, group]);

  if (group === undefined) return <><GroupHeadSkeleton /><FeedSkeleton /></>;
  if (group === null) {
    return (
      <div className="empty">
        <h2>Group not found</h2>
        <p>It may have been removed, or the link is wrong.</p>
        <a className="btn" href="#/groups">Back to groups</a>
      </div>
    );
  }

  const myRole: GroupRole | null = member ? (members?.find((m) => m.uid === s.uid)?.role ?? "member") : null;
  const isOwner = group.ownerUid === s.uid;
  const canManage = myRole === "admin" || myRole === "moderator";

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); s.notify(ok); }
    catch { s.notify("That did not go through. Try again."); }
    finally { setBusy(false); setArmed(false); }
  }

  return (
    <>
      <section className={`group-head${group.coverPhoto ? " has-cover" : ""}`}>
        {group.coverPhoto && (
          <button type="button" className="group-cover" aria-label={`View the cover photo of ${group.name}`} onClick={() => setViewing("cover")}>
            <img src={group.coverPhoto} alt="" />
          </button>
        )}
        {group.avatar ? (
          <button type="button" className="group-avatar-btn" aria-label={`View the picture of ${group.name}`} onClick={() => setViewing("avatar")}>
            <GroupAvatar name={group.name} photo={group.avatar} size="lg" />
          </button>
        ) : <GroupAvatar name={group.name} size="lg" />}
        <div className="group-head-text">
          <h1 className="name">{group.name}</h1>
          <p className="group-kind">{group.privacy === "private" ? <><LockIcon /> Private group</> : "Public group"}</p>
          {group.description && <p>{group.description}</p>}
          {myRole && myRole !== "member" && <p><RoleBadge role={myRole} /></p>}
        </div>
        <div className="group-head-actions">
          {(member || group.privacy !== "private") && (
            <button type="button" className="btn members-btn" title="Members" onClick={() => setListing(true)}><UsersIcon /><span className="lbl">Members</span></button>
          )}
          {member && <button type="button" className="btn" title="Invite people" onClick={() => setInviting(true)}><PlusIcon /><span className="lbl">Invite</span></button>}
          {canManage && <button type="button" className="btn" title="Manage group" onClick={() => setManaging(true)}><SettingsIcon /><span className="lbl">Manage</span></button>}
          {member && !isOwner && (
            <button type="button" className={`btn${armed ? " armed" : ""}`} disabled={busy} title="Leave group"
              onClick={() => (armed ? run(() => leaveGroup(s.uid, gid), "You left the group") : setArmed(true))}>
              {armed ? "Tap to leave" : <><LogOutIcon /><span className="lbl">Leave</span></>}
            </button>
          )}
          {!member && (group.privacy !== "private" || invited) && (
            <button type="button" className="btn primary" disabled={busy}
              onClick={() => run(() => (group.privacy === "private" ? acceptInvite(s.uid, gid) : joinGroup(s.uid, gid)), `Joined ${group.name}`)}>Join group</button>
          )}
          {!member && group.privacy === "private" && !invited && (
            request ? (
              <button type="button" className="btn" disabled={busy} title="Cancel your request"
                onClick={() => run(() => cancelRequest(s.uid, gid), "Request cancelled")}>Requested · Cancel</button>
            ) : (
              <button type="button" className="btn primary" disabled={busy || request === undefined} onClick={() => setAsking(true)}>Ask to join</button>
            )
          )}
        </div>
      </section>
      {armed && <p className="hint note">Leaving also takes your entries out of this group.</p>}

      {member ? <GroupFeed gid={gid} name={group.name} canModerate={canManage} /> : (
        <div className="empty">
          <h2>{group.privacy === "private" ? "This group is private" : "Join to see what is shared"}</h2>
          <p>
            {group.privacy !== "private" ? `Entries in ${group.name} are only visible to its members.`
              : request ? "Your request is waiting for an admin or moderator. You will be told when it is approved."
              : invited ? "You were invited. Join to see what is shared."
              : `Ask to join, and an admin or moderator will decide. Entries in ${group.name} are only visible to its members.`}
          </p>
        </div>
      )}
      {asking && <JoinRequestSheet group={group} onClose={() => setAsking(false)} />}
      {viewing && (viewing === "avatar" ? group.avatar : group.coverPhoto) && (
        <ImageViewer src={viewing === "avatar" ? group.avatar : group.coverPhoto}
          label={viewing === "avatar" ? `${group.name} picture` : `${group.name} cover photo`} onClose={() => setViewing(null)} />
      )}
      {listing && (
        <GroupMembersSheet gid={gid} members={members} error={membersError} ownerUid={group.ownerUid} myRole={myRole} onClose={() => setListing(false)}
          onInvite={member ? () => { setListing(false); setInviting(true); } : undefined} />
      )}
      {inviting && <InviteSheet gid={gid} groupName={group.name} onClose={() => setInviting(false)} />}
      {managing && myRole && canManage && (
        <GroupManageSheet group={group} myRole={myRole} onClose={() => setManaging(false)} />
      )}
    </>
  );
}
