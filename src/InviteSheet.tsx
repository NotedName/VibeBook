import { useEffect, useMemo, useState, type FormEvent } from "react";
import { NameSkeleton } from "./Skeleton";
import { inviteToGroup, loadMembers, loadMyInvitees } from "./groups";
import { searchProfiles } from "./profiles";
import { useProfile, useSession } from "./session";
import { MAX_INVITES_AT_ONCE } from "./types";
import Avatar from "./Avatar";
import { CloseIcon, SearchIcon } from "./icons";

function Candidate({ uid, checked, disabled, status, onToggle }: {
  uid: string; checked: boolean; disabled: boolean; status: string; onToggle: () => void;
}) {
  const p = useProfile(uid);
  const unavailable = !!status;
  return (
    <li>
      <label className={`invite-row${checked ? " on" : ""}${unavailable ? " off" : ""}`}>
        <input type="checkbox" checked={checked} disabled={unavailable || (!checked && disabled)} onChange={onToggle} />
        <Avatar profile={p} />
        <span className="invite-name">
          <b>{p === undefined ? <NameSkeleton /> : p?.displayName || "VibeBook member"}</b>
          {p?.headline && <small>{p.headline}</small>}
        </span>
        {status && <small className="invite-status">{status}</small>}
      </label>
    </li>
  );
}

/** Pick several friends or other people and invite them to a group in one go. */
export default function InviteSheet({ gid, groupName, onClose }: { gid: string; groupName: string; onClose: () => void }) {
  const s = useSession();
  const [text, setText] = useState("");
  const [found, setFound] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [members, setMembers] = useState<Set<string> | null>(null);
  const [invited, setInvited] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => {
    let live = true;
    Promise.all([loadMembers(gid), loadMyInvitees(s.uid, gid)]).then(
      ([m, i]) => { if (live) { setMembers(new Set(m)); setInvited(new Set(i)); } },
      () => { if (live) setError("Could not check who is already in the group."); },
    );
    return () => { live = false; };
  }, [gid, s.uid]);

  useEffect(() => {
    const q = text.trim();
    if (!q) { setFound(null); setSearching(false); return; }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchProfiles(q, s.uid).then(
        (r) => { if (live) { setFound(r.map((p) => p.uid)); setSearching(false); } },
        () => { if (live) { setError("Search did not work. Check your connection."); setSearching(false); } },
      );
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [text, s.uid]);

  const friends = useMemo(() => [...s.friends], [s.friends]);
  const list = found ?? friends;
  const atLimit = picked.length >= MAX_INVITES_AT_ONCE;
  const statusOf = (id: string) => (members?.has(id) ? "In group" : invited?.has(id) ? "Invited" : "");

  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!picked.length) return;
    setBusy(true);
    setError("");
    try {
      await inviteToGroup(s.uid, gid, picked, groupName);
      s.notify(picked.length === 1 ? "Invite sent" : `${picked.length} invites sent`);
      onClose();
    } catch {
      setError("Could not send the invites. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={`Invite people to ${groupName}`} onSubmit={submit}>
        <div className="sheet-head">
          <h2>Invite to {groupName}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <div className="search sheet-search">
            <SearchIcon />
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} autoFocus
              placeholder="Search anyone by name" aria-label="Search people by name"
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
          </div>
          <p className="hint">
            {found === null ? "Your friends. Search to invite anyone else." : searching ? "Searching…" : `${list.length} found`}
            {" · "}Tick as many people as you like.
          </p>
          {found === null && friends.length === 0 && <p className="hint">You have no friends on VibeBook yet. Search for people by name above.</p>}
          {found !== null && !searching && found.length === 0 && <p className="hint">No one found. Try the start of a first or last name.</p>}
          <ul className="invite-list">
            {list.map((id) => (
              <Candidate key={id} uid={id} checked={picked.includes(id)} disabled={atLimit}
                status={statusOf(id)} onToggle={() => toggle(id)} />
            ))}
          </ul>
          {atLimit && <p className="hint">You can invite up to {MAX_INVITES_AT_ONCE} people at a time.</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy || picked.length === 0}>
            {busy ? "Sending…" : picked.length ? `Invite ${picked.length} ${picked.length === 1 ? "person" : "people"}` : "Invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
