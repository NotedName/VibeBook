import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  approveRequest, cleanQuestions, declineRequest, deleteGroup, GROUP_DESC_MAX, GROUP_NAME_MAX, saveGroupChanges, useJoinRequests,
} from "./groups";
import { syncEntryPrivacy } from "./entryPrivacy";
import type { Group, GroupPrivacy, GroupRole, JoinRequest } from "./types";
import GroupAccessFields from "./GroupAccessFields";
import { ago } from "./notifications";
import { useProfile, useSession } from "./session";
import { personHash } from "./profiles";
import Avatar from "./Avatar";
import { coverBanner, squareAvatar } from "./image";
import { DropHint, useImageDrop } from "./imageDrop";
import PhotoEditor from "./PhotoEditor";
import { CameraIcon, CloseIcon, ImageIcon, TrashIcon } from "./icons";
import ConfirmDialog from "./ConfirmDialog";
import { GroupAvatar } from "./GroupRow";
import { useAction } from "./MemberManage";
import { useScrollLock } from "./scrollLock";

type Props = {
  group: Group;
  /** the signed-in person's role here: only admins and moderators can open this sheet */
  myRole: GroupRole;
  onClose: () => void;
};

function RequestRow({ group, request }: { group: Group; request: JoinRequest }) {
  const s = useSession();
  const p = useProfile(request.uid);
  const { busy, run } = useAction();
  const name = p === undefined ? "…" : p?.displayName || "VibeBook member";
  return (
    <li className="req-card">
      <div className="person">
        <a href={personHash(request.uid, p)} className="person-link">
          <Avatar profile={p} size="md" />
          <span className="person-text"><b>{name}</b><span>Asked {ago(request.createdAt)} ago</span></span>
        </a>
      </div>
      <dl className="req-answers">
        <dt>Why they want to join</dt>
        <dd>{request.message}</dd>
        {group.questions.map((q, i) => (
          <div key={i}><dt>{q}</dt><dd>{request.answers[i] || "No answer"}</dd></div>
        ))}
      </dl>
      <div className="req-actions">
        <button type="button" className="btn primary" disabled={busy}
          onClick={() => run(() => approveRequest(s.uid, group, request.uid), `${name} joined the group`)}>Approve</button>
        <button type="button" className="btn" disabled={busy}
          onClick={() => run(() => declineRequest(group.id, request.uid), "Request declined")}>Decline</button>
      </div>
    </li>
  );
}

/** Requests waiting for approval in a private group. Admins and moderators see them. */
function Requests({ group }: { group: Group }) {
  const { requests, error } = useJoinRequests(group.id, group.privacy === "private");
  if (group.privacy !== "private") return null;
  return (
    <section className="manage-section">
      <h3>Join requests {requests && <span>{requests.length}</span>}</h3>
      {error && <p className="error note">{error}</p>}
      {requests && requests.length === 0 && !error && <p className="hint">No one is waiting. People who ask to join show up here.</p>}
      {requests && requests.length > 0 && (
        <ul className="req-list">{requests.map((r) => <RequestRow key={r.uid} group={group} request={r} />)}</ul>
      )}
    </section>
  );
}

/**
 * Admins edit the group's picture, cover, name and description here. Nothing is saved while editing: pictures and
 * text are only drafts until "Save changes" is pressed, and "Discard changes" puts everything back.
 */
function Details({ group, onDirty }: { group: Group; onDirty: (dirty: boolean) => void }) {
  const { busy, run } = useAction();
  const s = useSession();
  const { notify } = s;
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [avatar, setAvatar] = useState(group.avatar);
  const [cover, setCover] = useState(group.coverPhoto);
  const [privacy, setPrivacy] = useState<GroupPrivacy>(group.privacy);
  const [questions, setQuestions] = useState<string[]>(group.questions);
  const [editing, setEditing] = useState<{ kind: "avatar" | "cover"; file: File } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const picking = useRef<"avatar" | "cover">("avatar");

  const cleanQs = cleanQuestions(questions, privacy);
  const accessChanged = privacy !== group.privacy || cleanQs.join("\n") !== group.questions.join("\n");
  const changed = name.trim() !== group.name || description.trim() !== group.description || avatar !== group.avatar || cover !== group.coverPhoto || accessChanged;
  useEffect(() => { onDirty(changed); return () => onDirty(false); }, [changed, onDirty]);

  function pick(kind: "avatar" | "cover") { picking.current = kind; input.current?.click(); }
  // A picture dragged onto the group picture or the cover opens the same editor as choosing one (computers only).
  const notPicture = () => notify("Drop a picture file.");
  const avatarDrop = useImageDrop((f) => setEditing({ kind: "avatar", file: f[0] }), { disabled: busy, onRejected: notPicture });
  const coverDrop = useImageDrop((f) => setEditing({ kind: "cover", file: f[0] }), { disabled: busy, onRejected: notPicture });
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
    setPrivacy(group.privacy); setQuestions(group.questions);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const photos: Partial<Pick<Group, "avatar" | "coverPhoto">> = {};
    if (avatar !== group.avatar) photos.avatar = avatar;
    if (cover !== group.coverPhoto) photos.coverPhoto = cover;
    const goingPrivate = privacy === "private" && group.privacy !== "private";
    run(async () => {
      await saveGroupChanges(group.id, name, description, photos, accessChanged ? { privacy, questions: cleanQs } : undefined);
      // Your own entries in this group follow its new privacy right away; other members' entries follow when they next open the app.
      if (privacy !== group.privacy) await syncEntryPrivacy(s.uid).catch(() => {});
    }, goingPrivate ? "Group is now private" : "Group updated");
  }

  return (
    <form className="manage-details" onSubmit={submit}>
      <div className="manage-photos">
        <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
        <div className={`manage-photo-row drop-zone${avatarDrop.over ? " drop-over one" : ""}`} {...avatarDrop.bind}>
          {avatarDrop.over && <DropHint label="Drop picture" />}
          <GroupAvatar name={name || group.name} photo={avatar} size="lg" />
          <div className="manage-photo-actions">
            <b>Group picture</b>
            <div>
              <button type="button" className="btn small" disabled={busy} onClick={() => pick("avatar")}><CameraIcon /> {avatar ? "Change" : "Add"}</button>
              {avatar && <button type="button" className="btn small" disabled={busy} onClick={() => setAvatar("")}>Remove</button>}
            </div>
          </div>
        </div>
        <div className={`manage-photo-cover drop-zone${coverDrop.over ? " drop-over one" : ""}`} {...coverDrop.bind}>
          {coverDrop.over && <DropHint label="Drop cover photo" />}
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
      <GroupAccessFields privacy={privacy} questions={questions} onPrivacy={setPrivacy} onQuestions={setQuestions} disabled={busy} />
      {privacy !== group.privacy && (
        <p className="hint">
          {privacy === "private"
            ? "Entries already shared to this group will be hidden from profiles and feeds. Their authors' own entries are updated when they next open VibeBook."
            : "Entries stay as they are until their authors next open VibeBook, when they go back to the visibility their authors chose. People waiting to join can join directly."}
        </p>
      )}
      {changed && <p className="hint unsaved" role="status">Unsaved changes. Press Save changes to apply them.</p>}
      <div className="manage-save">
        <button type="submit" className="btn primary" disabled={busy || !changed || !name.trim()}>{busy ? "Saving…" : "Save changes"}</button>
        {changed && <button type="button" className="btn" disabled={busy} onClick={discard}>Discard changes</button>}
      </div>
    </form>
  );
}

/** Admins and moderators manage a group here: its details and who is waiting to join. Roles and removals are in the Members popup. */
export default function GroupManageSheet({ group, myRole, onClose }: Props) {
  const s = useSession();
  const isAdmin = myRole === "admin";
  const isOwner = group.ownerUid === s.uid;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = useRef(false);
  const onDirty = useCallback((d: boolean) => { dirty.current = d; }, []);
  // Closing with unsaved changes asks first, so a stray tap outside the sheet does not throw an edit away.
  const close = useCallback(() => {
    if (dirty.current && !window.confirm("Discard your unsaved changes to this group?")) return;
    onClose();
  }, [onClose]);

  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
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
              ? "Admins edit the group and decide who may join. To change roles or remove people, open Members."
              : "Moderators decide who may join and take posts out of the feed (open a post's menu to remove it). To remove people, open Members."}
          </p>
          <Requests group={group} />
          {isAdmin && <section className="manage-section"><h3>Details</h3><Details group={group} onDirty={onDirty} /></section>}
          {isOwner && (
            <section className="manage-section deactivate-section" aria-label="Delete group">
              <h3>Delete group</h3>
              <p className="hint">Permanently deletes this group and notifies all members. Members' own entries remain on their profiles.</p>
              <button type="button" className="btn danger" disabled={deleting} onClick={() => setConfirmDelete(true)}>
                <TrashIcon />{deleting ? "Deleting…" : "Delete group"}
              </button>
            </section>
          )}
        </div>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete “${group.name}”?`}
          confirmLabel="Delete group"
          danger
          typeToConfirm="delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false);
            setDeleting(true);
            try {
              await deleteGroup(s.uid, group);
              s.notify(`Deleted “${group.name}”`);
              onClose();
              window.location.hash = "#/groups";
            } catch {
              s.notify("Could not delete the group. Try again.");
              setDeleting(false);
            }
          }}
        >
          <p>Everyone in this group will receive a notification that it was deleted, and the group feed will be removed permanently.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
