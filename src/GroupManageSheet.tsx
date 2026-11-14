import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  allowBack, canChangeRole, canRemove, GROUP_DESC_MAX, GROUP_NAME_MAX, removeMember, saveGroupChanges, setMemberRole, useBannedUids,
} from "./groups";
import { ROLES, type Group, type GroupRole, type Member } from "./types";
import { useProfile, useSession } from "./session";
import { personHash } from "./profiles";
import Avatar from "./Avatar";
import { coverBanner, squareAvatar } from "./image";
import PhotoEditor from "./PhotoEditor";
import { CameraIcon, CloseIcon, ImageIcon } from "./icons";
import { GroupAvatar } from "./GroupRow";

type Props = {
  group: Group;
  /** the signed-in person's role here: only admins and moderators can open this sheet */
  myRole: GroupRole;
  /** everyone in the group, owner counted as admin, in display order */
  members: Member[];
  onClose: () => void;
};

const roleLabel = (r: GroupRole) => ROLES.find((x) => x.id === r)!.label;

/** Run an action with a busy flag, and tell the person how it went. */
function useAction() {
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

function MemberRow({ gid, member, myRole, ownerUid }: { gid: string; member: Member; myRole: GroupRole; ownerUid: string }) {
  const s = useSession();
  const p = useProfile(member.uid);
  const { busy, run } = useAction();
  const [armed, setArmed] = useState(false);
  const name = p === undefined ? "…" : p?.displayName || "VibeBook member";
  const changeRole = canChangeRole(myRole, member, ownerUid, s.uid);
  const removable = canRemove(myRole, member, ownerUid, s.uid);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <li className="person">
      <a href={personHash(member.uid, p)} className="person-link">
        <Avatar profile={p} size="md" />
        <span className="person-text">
          <b>{name}{member.uid === s.uid && " (you)"}</b>
          <span>{member.uid === ownerUid ? "Owner · Admin" : roleLabel(member.role)}</span>
        </span>
      </a>
      <div className="relation">
        {changeRole && (
          <select className="role-select" aria-label={`Role for ${name}`} value={member.role} disabled={busy}
            onChange={(e) => {
              const role = e.target.value as GroupRole;
              run(() => setMemberRole(gid, member.uid, role), `${name} is now ${roleLabel(role).toLowerCase()}`);
            }}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        )}
        {removable && (
          <button type="button" className={`btn${armed ? " armed" : ""}`} disabled={busy}
            onClick={() => (armed ? run(() => removeMember(gid, member.uid, s.uid), `${name} was removed`) : setArmed(true))}>
            {armed ? "Tap to confirm" : "Remove"}
          </button>
        )}
      </div>
    </li>
  );
}

function RemovedRow({ gid, uid, canAllow }: { gid: string; uid: string; canAllow: boolean }) {
  const p = useProfile(uid);
  const { busy, run } = useAction();
  const name = p === undefined ? "…" : p?.displayName || "VibeBook member";
  return (
    <li className="person">
      <span className="person-link">
        <Avatar profile={p} size="md" />
        <span className="person-text"><b>{name}</b><span>Cannot rejoin</span></span>
      </span>
      {canAllow && (
        <button type="button" className="btn" disabled={busy} onClick={() => run(() => allowBack(gid, uid), `${name} can rejoin`)}>
          Allow back
        </button>
      )}
    </li>
  );
}

/**
 * Admins edit the group's picture, cover, name and description here. Nothing is saved while editing: pictures and
 * text are only drafts until "Save changes" is pressed, and "Discard changes" puts everything back.
 */
function Details({ group, onDirty }: { group: Group; onDirty: (dirty: boolean) => void }) {
  const { busy, run } = useAction();
  const { notify } = useSession();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [avatar, setAvatar] = useState(group.avatar);
  const [cover, setCover] = useState(group.coverPhoto);
  const [editing, setEditing] = useState<{ kind: "avatar" | "cover"; file: File } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const picking = useRef<"avatar" | "cover">("avatar");

  const changed = name.trim() !== group.name || description.trim() !== group.description || avatar !== group.avatar || cover !== group.coverPhoto;
  useEffect(() => { onDirty(changed); return () => onDirty(false); }, [changed, onDirty]);

  function pick(kind: "avatar" | "cover") { picking.current = kind; input.current?.click(); }
  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setEditing({ kind: picking.current, file });
  }
  /** The adjusted picture becomes a draft shown in the preview; it is not saved yet. */
  async function apply(file: File) {
    const kind = editing!.kind;
    setEditing(null);
    try {
      if (kind === "avatar") setAvatar(await squareAvatar(file));
      else setCover(await coverBanner(file));
    } catch { notify("That image could not be used"); }
  }
  function discard() {
    setName(group.name); setDescription(group.description); setAvatar(group.avatar); setCover(group.coverPhoto);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const photos: Partial<Pick<Group, "avatar" | "coverPhoto">> = {};
    if (avatar !== group.avatar) photos.avatar = avatar;
    if (cover !== group.coverPhoto) photos.coverPhoto = cover;
    run(() => saveGroupChanges(group.id, name, description, photos), "Group updated");
  }

  return (
    <form className="manage-details" onSubmit={submit}>
      <div className="manage-photos">
        <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
        <div className="manage-photo-row">
          <GroupAvatar name={name || group.name} photo={avatar} size="lg" />
          <div className="manage-photo-actions">
            <b>Group picture</b>
            <div>
              <button type="button" className="btn small" disabled={busy} onClick={() => pick("avatar")}><CameraIcon /> {avatar ? "Change" : "Add"}</button>
              {avatar && <button type="button" className="btn small" disabled={busy} onClick={() => setAvatar("")}>Remove</button>}
            </div>
          </div>
        </div>
        <div className="manage-photo-cover">
          <div className="cover-preview c-amethyst">{cover && <img src={cover} alt="" />}</div>
          <div className="manage-photo-actions">
            <b>Cover photo</b>
            <div>
              <button type="button" className="btn small" disabled={busy} onClick={() => pick("cover")}><ImageIcon /> {cover ? "Change" : "Add"}</button>
              {cover && <button type="button" className="btn small" disabled={busy} onClick={() => setCover("")}>Remove</button>}
            </div>
          </div>
        </div>
        {editing && (
          <PhotoEditor file={editing.file} onCancel={() => setEditing(null)} onApply={apply}
            fixedRatio={editing.kind === "avatar" ? 1 : 3} outSide={editing.kind === "avatar" ? 512 : 1200}
            title={editing.kind === "avatar" ? "Adjust group picture" : "Adjust group cover"} />
        )}
      </div>
      <label>Name
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={GROUP_NAME_MAX} placeholder="e.g. BSIT 4A interns" />
      </label>
      <label>What is it for?
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={GROUP_DESC_MAX} placeholder="Who should join, and what do you share here?" />
      </label>
      {changed && <p className="hint unsaved" role="status">You have changes that are not saved yet. Nothing changes for the group until you press Save changes.</p>}
      <div className="manage-save">
        <button type="submit" className="btn primary" disabled={busy || !changed || !name.trim()}>{busy ? "Saving…" : "Save changes"}</button>
        {changed && <button type="button" className="btn" disabled={busy} onClick={discard}>Discard changes</button>}
      </div>
    </form>
  );
}

/** Admins and moderators manage a group here: its details, its members' roles, and who has been removed. */
export default function GroupManageSheet({ group, myRole, members, onClose }: Props) {
  const isAdmin = myRole === "admin";
  const banned = useBannedUids(group.id, true);
  const dirty = useRef(false);
  const onDirty = useCallback((d: boolean) => { dirty.current = d; }, []);
  // Closing with unsaved changes asks first, so a stray tap outside the sheet does not throw an edit away.
  const close = useCallback(() => {
    if (dirty.current && !window.confirm("Discard your unsaved changes to this group?")) return;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [close]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet manage-sheet" role="dialog" aria-modal="true" aria-label={`Manage ${group.name}`}>
        <div className="sheet-head">
          <h2>Manage group</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={close}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <p className="hint">
            {isAdmin
              ? "Admins edit the group, change roles and remove members. Moderators remove members and take posts out of the feed."
              : "Moderators can remove members and take posts out of the feed. Open a post's menu in the feed to remove it."}
          </p>
          {isAdmin && <section className="manage-section"><h3>Details</h3><Details group={group} onDirty={onDirty} /></section>}
          <section className="manage-section">
            <h3>Members <span>{members.length}</span></h3>
            <ul className="people">
              {members.map((m) => <MemberRow key={m.uid} gid={group.id} member={m} myRole={myRole} ownerUid={group.ownerUid} />)}
            </ul>
            <p className="hint">Removed people cannot rejoin until an admin allows them back.</p>
          </section>
          {banned.length > 0 && (
            <section className="manage-section">
              <h3>Removed <span>{banned.length}</span></h3>
              <ul className="people">{banned.map((u) => <RemovedRow key={u} gid={group.id} uid={u} canAllow={isAdmin} />)}</ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
