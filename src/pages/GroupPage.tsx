import { useEffect, useMemo, useState } from "react";
import { joinGroup, leaveGroup, useGroup, useGroupMembers, withRoles } from "../groups";
import { useGroupEntries } from "../groupFeed";
import { useSession } from "../session";
import { dateDir, useSortedEntries, useSortMode } from "../sorting";
import SortMenu from "../SortMenu";
import { ROLES, type GroupRole, type Member } from "../types";
import EntryList from "../EntryList";
import PersonRow from "../PersonRow";
import { GroupAvatar } from "../GroupRow";
import InviteSheet from "../InviteSheet";
import GroupManageSheet from "../GroupManageSheet";
import ImageViewer from "../ImageViewer";
import { FeedSkeleton, GroupHeadSkeleton, RowsSkeleton } from "../Skeleton";
import { PlusIcon, SettingsIcon } from "../icons";

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

function Members({ members, error }: { members: Member[] | null; error: string }) {
  return (
    <section className="people-section members-inline">
      <h2>Members {members && <span>{members.length}</span>}</h2>
      {error && <p className="error note">{error}</p>}
      {!members && !error && <RowsSkeleton />}
      {members && (
        <ul className="people">
          {members.map((m) => <PersonRow key={m.uid} uid={m.uid} badge={<RoleBadge role={m.role} />} />)}
        </ul>
      )}
    </section>
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
  const [viewing, setViewing] = useState<"avatar" | "cover" | null>(null);
  const member = s.groups.ids.has(gid);
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
          {group.description && <p>{group.description}</p>}
          {myRole && myRole !== "member" && <p><RoleBadge role={myRole} /></p>}
        </div>
        <div className="group-head-actions">
          {member && <button type="button" className="btn" onClick={() => setInviting(true)}><PlusIcon /> Invite</button>}
          {canManage && <button type="button" className="btn" onClick={() => setManaging(true)}><SettingsIcon /> Manage</button>}
          {member && !isOwner && (
            <button type="button" className={`btn${armed ? " armed" : ""}`} disabled={busy}
              onClick={() => (armed ? run(() => leaveGroup(s.uid, gid), "You left the group") : setArmed(true))}>
              {armed ? "Tap to leave" : "Leave"}
            </button>
          )}
          {!member && (
            <button type="button" className="btn primary" disabled={busy}
              onClick={() => run(() => joinGroup(s.uid, gid), `Joined ${group.name}`)}>Join group</button>
          )}
        </div>
      </section>
      {armed && <p className="hint note">Leaving also takes your entries out of this group.</p>}

      {member ? <GroupFeed gid={gid} name={group.name} canModerate={canManage} /> : (
        <div className="empty">
          <h2>Join to see what is shared</h2>
          <p>Entries in {group.name} are only visible to its members.</p>
        </div>
      )}
      <Members members={members} error={membersError} />
      {viewing && (viewing === "avatar" ? group.avatar : group.coverPhoto) && (
        <ImageViewer src={viewing === "avatar" ? group.avatar : group.coverPhoto}
          label={viewing === "avatar" ? `${group.name} picture` : `${group.name} cover photo`} onClose={() => setViewing(null)} />
      )}
      {inviting && <InviteSheet gid={gid} groupName={group.name} onClose={() => setInviting(false)} />}
      {managing && myRole && canManage && members && (
        <GroupManageSheet group={group} myRole={myRole} members={members} onClose={() => setManaging(false)} />
      )}
    </>
  );
}
