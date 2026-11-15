import { useEffect, useState } from "react";
import { acceptInvite, declineInvite, discoverGroups, fetchGroup, searchGroups } from "../groups";
import { useSession } from "../session";
import type { Group, GroupInvite } from "../types";
import GroupRow from "../GroupRow";
import GroupSheet from "../GroupSheet";
import { PlusIcon, SearchIcon } from "../icons";
import { RowsSkeleton } from "../Skeleton";
import { GroupAvatar } from "../GroupRow";
import { useProfile } from "../session";

function InviteRow({ invite }: { invite: GroupInvite }) {
  const s = useSession();
  const inviter = useProfile(invite.from);
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    fetchGroup(invite.groupId).then((g) => live && setGroup(g), () => live && setGroup(null));
    return () => { live = false; };
  }, [invite.groupId]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); s.notify(ok); }
    catch { s.notify("That did not go through. Try again."); setBusy(false); }
  }

  if (group === null) return null; // the group no longer exists
  const name = group?.name ?? "…";
  return (
    <li className="person">
      <a href={`#/g/${encodeURIComponent(invite.groupId)}`} className="person-link">
        <GroupAvatar name={name} photo={group?.avatar} />
        <span className="person-text">
          <b>{name}</b>
          <span>Invited by {inviter === undefined ? "…" : inviter?.displayName || "a VibeBook member"}</span>
        </span>
      </a>
      <div className="relation">
        <button type="button" className="btn primary" disabled={busy || !group}
          onClick={() => run(() => acceptInvite(s.uid, invite.groupId), `Joined ${name}`)}>Join</button>
        <button type="button" className="btn" disabled={busy}
          onClick={() => run(() => declineInvite(s.uid, invite.groupId), "Invite declined")}>Decline</button>
      </div>
    </li>
  );
}

export default function GroupsPage() {
  const s = useSession();
  const [text, setText] = useState("");
  const [results, setResults] = useState<Group[] | null>(null);
  const [discover, setDiscover] = useState<Group[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let live = true;
    discoverGroups().then(
      (g) => live && setDiscover(g),
      () => live && setError("Could not load groups. Check your connection."),
    );
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const q = text.trim();
    if (!q) { setResults(null); return; }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchGroups(q).then(
        (r) => { if (live) { setResults(r); setError(""); setSearching(false); } },
        () => { if (live) { setError("Search did not work. Check your connection."); setSearching(false); } },
      );
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [text]);

  const others = (discover ?? []).filter((g) => !s.groups.ids.has(g.id));

  return (
    <div className="people-page">
      <div className="title-row">
        <h1 className="page-title">Groups</h1>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}><PlusIcon /> New group</button>
      </div>
      <div className="search">
        <SearchIcon />
        <input type="search" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Search groups by name" aria-label="Search groups by name" />
      </div>
      {(s.groups.error || error) && <p className="error note" role="alert">{s.groups.error || error}</p>}

      {s.invites.length > 0 && (
        <section className="people-section">
          <h2>Invitations <span>{s.invites.length}</span></h2>
          <ul className="people">{s.invites.map((i) => <InviteRow key={i.id} invite={i} />)}</ul>
        </section>
      )}

      {results !== null ? (
        <section className="people-section">
          <h2>Results {searching && <span>searching…</span>}</h2>
          {!searching && !error && results.length === 0 && <p className="note">No groups found. Try the start of a word in its name.</p>}
          <ul className="people">{results.map((g) => <GroupRow key={g.id} group={g} />)}</ul>
        </section>
      ) : (
        <>
          {!s.groups.ready && s.groups.list.length === 0 && (
            <section className="people-section"><h2>Your groups</h2><RowsSkeleton /></section>
          )}
          {s.groups.list.length > 0 && (
            <section className="people-section">
              <h2>Your groups <span>{s.groups.list.length}</span></h2>
              <ul className="people">{s.groups.list.map((g) => <GroupRow key={g.id} group={g} />)}</ul>
            </section>
          )}
          {discover === null && !error && (
            <section className="people-section"><h2>Discover</h2><RowsSkeleton /></section>
          )}
          {others.length > 0 && (
            <section className="people-section">
              <h2>Discover</h2>
              <ul className="people">{others.map((g) => <GroupRow key={g.id} group={g} />)}</ul>
            </section>
          )}
          {s.groups.ready && s.groups.list.length === 0 && discover !== null && others.length === 0 && (
            <div className="empty">
              <h2>No groups yet</h2>
              <p>Start one for your class, your office or your team, then share entries with just them.</p>
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>Create the first group</button>
            </div>
          )}
        </>
      )}

      {creating && (
        <GroupSheet
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); s.notify("Group created"); location.hash = `#/g/${encodeURIComponent(id)}`; }}
        />
      )}
    </div>
  );
}
