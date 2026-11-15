import { useEffect, useRef, useState } from "react";
import { deleteEntry, loadPhotos, setEntryArchived, setEntryVisibility, type Entry, type Photo } from "./entries";
import { copyText, entryText, entryWhen, longDay } from "./report";
import { useProfile, useSession } from "./session";
import { personHash } from "./profiles";
import { VISIBILITY, type Visibility } from "./types";
import { chosenVisibility } from "./entryPrivacy";
import Avatar from "./Avatar";
import ClampedText from "./ClampedText";
import { ArchiveIcon, CheckIcon, CommentIcon, CopyIcon, DownloadIcon, EditIcon, GlobeIcon, GroupsIcon, LockIcon, MoreIcon, RepostIcon, ShareIcon, TrashIcon, UnarchiveIcon, UsersIcon } from "./icons";
import GroupShareSheet from "./GroupShareSheet";
import ShareSheet from "./ShareSheet";
import { removeRepost, repostId } from "./reposts";
import { removePostFromGroup, useGroup } from "./groups";
import Comments from "./Comments";
import { useCommentCount } from "./commentStore";
import ReactionBar from "./ReactionBar";
import VideoPlayer from "./VideoPlayer";
import PhotoViewer from "./PhotoViewer";
import { postLink } from "./share";
import SkillChips from "./SkillChips";
import { downloadPhotos } from "./download";
import LockedPost from "./LockedPost";

type Props = {
  entry: Entry;
  onEdit?: (entry: Entry) => void;
  /** Shown inside this group's feed. Admins and moderators can take posts out of it. */
  inGroup?: { id: string; canModerate: boolean };
  /** The entry opened on its own page: comments start open, the description is shown in full, and nothing links to itself. */
  single?: boolean;
};

function GroupLink({ id }: { id: string }) {
  const g = useGroup(id);
  if (!g) return null;
  return <li><a href={`#/g/${encodeURIComponent(id)}`}><GroupsIcon />{g.name}</a></li>;
}

const VIS_ICON = { private: <LockIcon />, friends: <UsersIcon />, public: <GlobeIcon /> };

/** A post in a private group the viewer is not in shows as a placeholder; everything else is the full card. */
export default function EntryCard(props: Props) {
  return props.entry.lockedGroupId !== undefined ? <LockedPost entry={props.entry} /> : <FullEntryCard {...props} />;
}

function FullEntryCard({ entry, onEdit, inGroup, single = false }: Props) {
  const s = useSession();
  const ownerUid = entry.ownerUid ?? s.uid;
  const mine = ownerUid === s.uid;
  const owner = useProfile(ownerUid);
  const [photos, setPhotos] = useState<Photo[]>([]);
  // Index of the photo open in the viewer, null when it is closed.
  const [viewing, setViewing] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);
  const [armedRemove, setArmedRemove] = useState(false);
  const [commenting, setCommenting] = useState(single);
  const commentCount = useCommentCount(ownerUid, entry.id);
  const [menu, setMenu] = useState(false);
  const [visOpen, setVisOpen] = useState(false);
  const [sharing, setSharing] = useState<"share" | "repost" | null>(null);
  const reposter = useProfile(entry.repostedBy);
  const menuRef = useRef<HTMLDivElement>(null);
  const groupIds = (entry.groupIds ?? []).filter((id) => s.groups.ids.has(id));
  const vis = VISIBILITY.find((v) => v.id === (entry.visibility ?? "private"))!;
  // An entry in a private group is stored as "private"; say what is really going on.
  const inPrivateGroup = (entry.groupIds ?? []).some((id) => s.groups.list.some((g) => g.id === id && g.privacy === "private"));

  // createdAt/updatedAt change once the server confirms a write, which refreshes photos
  // that were still being committed when the first local snapshot arrived.
  const stamp = `${entry.createdAt?.seconds ?? 0}-${entry.updatedAt?.seconds ?? 0}`;
  useEffect(() => {
    let live = true;
    if (entry.photoCount > 0) {
      loadPhotos(ownerUid, entry.id).then((p) => live && setPhotos(p), () => {});
    } else {
      setPhotos([]);
    }
    return () => { live = false; };
  }, [ownerUid, entry.id, entry.photoCount, stamp]);

  useEffect(() => {
    if (!armed && !armedRemove) return;
    const t = setTimeout(() => { setArmed(false); setArmedRemove(false); }, 3500);
    return () => clearTimeout(t);
  }, [armed, armedRemove]);

  useEffect(() => {
    if (!menu) return;
    const close = () => { setMenu(false); setVisOpen(false); setArmed(false); setArmedRemove(false); };
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  async function copy() {
    setMenu(false);
    const text = entryText(entry);
    if (await copyText(text)) s.notify("Entry copied");
    else s.manualCopy(text);
  }

  async function downloadAll() {
    setMenu(false);
    if (await downloadPhotos(photos, entry.title)) s.notify(photos.length > 1 ? "Photos saved" : "Photo saved");
    else s.notify("Could not download the photos");
  }

  function changeVisibility(v: Visibility) {
    setMenu(false);
    setVisOpen(false);
    if (v === chosenVisibility(entry)) return;
    setEntryVisibility(ownerUid, entry, v).then(
      () => s.notify(`Now visible to: ${VISIBILITY.find((x) => x.id === v)!.label.toLowerCase()}`),
      () => s.notify("Could not change who can see this"),
    );
  }

  function toggleArchive() {
    setMenu(false);
    const archive = entry.archived !== true;
    setEntryArchived(ownerUid, entry, archive).then(
      () => s.notify(archive ? "Entry archived. Find it under Archived entries in your account menu." : "Entry restored to your logbook"),
      () => s.notify(archive ? "Could not archive the entry" : "Could not restore the entry"),
    );
  }

  const isPublic = (entry.visibility ?? "private") === "public";
  const myRepost = s.reposts.get(repostId(ownerUid, entry.id));
  const iReposted = entry.repostedBy === s.uid;
  const reposterName = entry.repostedBy === s.uid ? "You" : reposter?.displayName || "Someone";

  /** Copies the link to this entry, or opens the phone's share sheet. Only for Public entries. */
  async function shareLink() {
    const url = postLink(ownerUid, entry.id);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: entry.title, url });
        return;
      } catch (err) {
        if ((err as DOMException).name === "AbortError") return; // closed the share sheet
      }
    }
    if (await copyText(url)) s.notify("Link copied");
    else s.manualCopy(url);
  }

  const expecting = entry.photoCount > 0 && photos.length === 0;
  const name = owner?.displayName || (owner === undefined ? "…" : "VibeBook member");

  return (
    <article className="post">
      {entry.repostedBy && (
        <p className="repost-note"><RepostIcon />
          {entry.repostedBy === s.uid ? <b>{reposterName}</b> : <a href={personHash(entry.repostedBy, reposter)}><b>{reposterName}</b></a>} reposted
        </p>
      )}
      <header className="post-head">
        {mine ? <Avatar profile={owner} /> : (
          <a href={personHash(ownerUid, owner)} aria-label={`${name}'s profile`}><Avatar profile={owner} /></a>
        )}
        <div className="post-who">
          {mine ? <b>{name}</b> : <a className="post-name" href={personHash(ownerUid, owner)}>{name}</a>}
          <time>{longDay(entry.date)} · {entryWhen(entry)}</time>
          {mine && entry.archived && <span className="archived-tag" title="Only you can see this entry"><ArchiveIcon />Archived</span>}
          {groupIds.length > 0 && <ul className="group-links" aria-label="Shared to groups">{groupIds.map((id) => <GroupLink key={id} id={id} />)}</ul>}
        </div>
        {mine && (inPrivateGroup
          ? <span className="vis vis-group" title="Shared to a private group: only its members can see this entry."><LockIcon />Private group</span>
          : <span className={`vis vis-${vis.id}`} title={vis.hint}>{VIS_ICON[vis.id]}{vis.label}</span>)}
        <div className="post-menu" ref={menuRef}>
          <button type="button" className="icon-btn menu-btn" aria-label="More actions" aria-haspopup="menu"
            aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreIcon /></button>
          {menu && (
            <div className="menu" role="menu">
              {!single && (
                <a role="menuitem" className="menu-link" href={`#/p/${encodeURIComponent(ownerUid)}/${encodeURIComponent(entry.id)}`} onClick={() => setMenu(false)}><CommentIcon />Open post</a>
              )}
              <button type="button" role="menuitem" onClick={copy}><CopyIcon />Copy</button>
              {photos.length > 0 && (
                <button type="button" role="menuitem" onClick={downloadAll}><DownloadIcon />{photos.length > 1 ? `Download ${photos.length} photos` : "Download photo"}</button>
              )}
              {myRepost && (
                <button type="button" role="menuitem" onClick={() => {
                  setMenu(false);
                  removeRepost(s.uid, myRepost).then(() => s.notify("Repost removed"), () => s.notify("Could not remove repost"));
                }}><RepostIcon />Undo repost</button>
              )}
              {inGroup?.canModerate && (entry.repostedBy ?? ownerUid) !== s.uid && (
                <button type="button" role="menuitem" className={`danger${armedRemove ? " armed" : ""}`}
                  onClick={() => {
                    if (!armedRemove) return setArmedRemove(true);
                    setMenu(false); setArmedRemove(false);
                    removePostFromGroup(inGroup.id, ownerUid, entry.id, entry.repostedBy)
                      .then(() => s.notify("Removed from the group"), () => s.notify("Could not remove the post"));
                  }}>
                  <TrashIcon />{armedRemove ? "Tap to confirm" : "Remove from group"}
                </button>
              )}
              {mine && (
                <button type="button" role="menuitem" onClick={toggleArchive}>
                  {entry.archived ? <><UnarchiveIcon />Unarchive</> : <><ArchiveIcon />Archive</>}
                </button>
              )}
              {mine && (
                <>
                  <button type="button" role="menuitem" aria-expanded={visOpen} disabled={inPrivateGroup}
                    title={inPrivateGroup ? "Shared to a private group: only its members can see this entry." : undefined}
                    onClick={() => setVisOpen(!visOpen)}>
                    {VIS_ICON[vis.id]}Who can see this
                  </button>
                  {visOpen && VISIBILITY.map((v) => (
                    <button key={v.id} type="button" role="menuitemradio" className="menu-sub" aria-checked={chosenVisibility(entry) === v.id}
                      onClick={() => changeVisibility(v.id)}>
                      {chosenVisibility(entry) === v.id ? <CheckIcon /> : <span className="menu-gap" aria-hidden="true" />}{v.label}
                    </button>
                  ))}
                </>
              )}
              {mine && onEdit && (
                <>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onEdit(entry); }}><EditIcon />Edit</button>
                  <button type="button" role="menuitem" className={`danger${armed ? " armed" : ""}`}
                    onClick={() => {
                      if (!armed) return setArmed(true);
                      setMenu(false);
                      deleteEntry(ownerUid, entry).then(() => s.notify("Entry deleted"), () => s.notify("Could not delete"));
                    }}>
                    <TrashIcon />{armed ? "Tap to confirm" : "Delete"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="post-body">
        <h2 className="post-title">{single ? entry.title : <a href={`#/p/${encodeURIComponent(ownerUid)}/${encodeURIComponent(entry.id)}`}>{entry.title}</a>}</h2>
        {entry.description && (single ? <p className="post-desc">{entry.description}</p> : <ClampedText className="post-desc" text={entry.description} />)}
        <SkillChips skills={entry.skills} />
      </div>

      {expecting && <div className="photo-grid placeholder" aria-hidden="true" />}
      {photos.length > 0 && (
        <div className={`photo-grid ${photos.length % 2 ? "odd" : "even"}`}>
          {photos.map((p, i) => (
            <button key={p.id} type="button" className="photo-btn" onClick={() => setViewing(i)}
              aria-label={`Open photo ${i + 1} of ${entry.title}`}>
              <img src={p.data} alt={`${entry.title} photo ${i + 1}`} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {entry.videoUrl && <VideoPlayer url={entry.videoUrl} title={entry.title} />}

      <div className="post-actions">
        <ReactionBar ownerUid={ownerUid} entryId={entry.id} title={entry.title} myUid={s.uid} onError={s.notify} />
        <button type="button" className={`act${commenting ? " on" : ""}`} aria-expanded={commenting}
          aria-label={commentCount ? `Comment, ${commentCount} so far` : "Comment"}
          onClick={() => setCommenting(!commenting)}><CommentIcon /><span className="label">Comment</span>{!!commentCount && <b className="count">{commentCount}</b>}</button>
        {isPublic && !mine && (
          <button type="button" className={`act${myRepost ? " on" : ""}`} aria-pressed={!!myRepost}
            aria-label={myRepost ? "Reposted" : "Repost"} title={myRepost ? "Reposted" : "Repost"}
            onClick={() => setSharing("repost")}><RepostIcon /><span className="label">{myRepost ? "Reposted" : "Repost"}</span></button>
        )}
        {(isPublic || mine) && (
          <button type="button" className="act" aria-label="Share" title="Share" onClick={() => setSharing("share")}><ShareIcon /><span className="label">Share</span></button>
        )}
      </div>

      {sharing === "share" && <ShareSheet entry={entry} linkable={isPublic} onLink={shareLink} onClose={() => setSharing(null)} />}
      {sharing === "repost" && <GroupShareSheet kind="repost" entry={entry} onClose={() => setSharing(null)} />}
      {commenting && <Comments ownerUid={ownerUid} entryId={entry.id} title={entry.title} />}

      {viewing !== null && photos.length > 0 && (
        <PhotoViewer ownerUid={ownerUid} entryId={entry.id} title={entry.title} photos={photos}
          index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} myUid={s.uid} onError={s.notify} />
      )}
    </article>
  );
}
