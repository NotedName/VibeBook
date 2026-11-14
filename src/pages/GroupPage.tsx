import { useEffect, useState } from "react";
import { joinGroup, leaveGroup, loadMembers, useGroup } from "../groups";
import { useGroupEntries } from "../groupFeed";
import { useSession } from "../session";
import EntryList from "../EntryList";
import PersonRow from "../PersonRow";
import { GroupAvatar } from "../GroupRow";
import InviteSheet from "../InviteSheet";
import { PlusIcon } from "../icons";

function GroupFeed({ gid, name }: { gid: string; name: string }) {
  const s = useSession();
  const { entries, loading, error } = useGroupEntries(gid);
  return (
    <>
      <div className="composer">
        <button type="button" className="composer-input" onClick={() => s.openEntry(null, gid)}>
          Share an entry with {name}…
        </button>
      </div>
      <div className="feed" aria-live="polite">
        {error && <p className="error note" role="alert">{error}</p>}
        {loading && entries.length === 0 && <p className="note">Loading entries…</p>}
        {!loading && entries.length === 0 && !error && (
          <div className="empty">
            <h2>Nothing shared yet</h2>
            <p>Entries that members share with this group show up here. Be the first.</p>
          </div>
        )}
        <EntryList entries={entries} onEdit={s.openEntry} />
      </div>
    </>
  );
}

function Members({ gid, member }: { gid: string; member: boolean }) {
  const [uids, setUids] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    loadMembers(gid).then(
      (u) => live && setUids(u),
      () => live && setError("Could not load members."),
    );
    return () => { live = false; };
  }, [gid, member]);

  return (
    <section className="people-section">
      <h2>Members {uids && <span>{uids.length}</span>}</h2>
      {error && <p className="error note">{error}</p>}
      {uids && <ul className="people">{uids.map((id) => <PersonRow key={id} uid={id} />)}</ul>}
    </section>
  );
}

export default function GroupPage({ gid }: { gid: string }) {
  const s = useSession();
  const group = useGroup(gid);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [inviting, setInviting] = useState(false);
  const member = s.groups.ids.has(gid);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  if (group === undefined) return <p className="note">Loading group…</p>;
  if (group === null) {
    return (
      <div className="empty">
        <h2>Group not found</h2>
        <p>It may have been removed, or the link is wrong.</p>
        <a className="btn" href="#/groups">Back to groups</a>
      </div>
    );
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); s.notify(ok); }
    catch { s.notify("That did not go through. Try again."); }
    finally { setBusy(false); setArmed(false); }
  }

  return (
    <>
      <section className="group-head">
        <GroupAvatar name={group.name} size="lg" />
        <div className="group-head-text">
          <h1 className="name">{group.name}</h1>
          {group.description && <p>{group.description}</p>}
        </div>
        {member && (
          <button type="button" className="btn" onClick={() => setInviting(true)}><PlusIcon /> Invite</button>
        )}
        {member ? (
          <button type="button" className={`btn${armed ? " armed" : ""}`} disabled={busy}
            onClick={() => (armed ? run(() => leaveGroup(s.uid, gid), "You left the group") : setArmed(true))}>
            {armed ? "Tap to leave" : "Leave"}
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={busy}
            onClick={() => run(() => joinGroup(s.uid, gid), `Joined ${group.name}`)}>Join group</button>
        )}
      </section>
      {armed && <p className="hint note">Leaving also takes your entries out of this group.</p>}

      {member ? <GroupFeed gid={gid} name={group.name} /> : (
        <div className="empty">
          <h2>Join to see what is shared</h2>
          <p>Entries in {group.name} are only visible to its members.</p>
        </div>
      )}
      <Members gid={gid} member={member} />
      {inviting && <InviteSheet gid={gid} groupName={group.name} onClose={() => setInviting(false)} />}
    </>
  );
}
