import { useEffect, useState } from "react";
import { deleteEntry, loadPhotos, type Entry } from "./entries";
import { clockTime, copyText, entryText, longDay } from "./report";
import { useProfile, useSession } from "./session";
import { VISIBILITY } from "./types";
import Avatar from "./Avatar";
import { CloseIcon, CommentIcon, CopyIcon, EditIcon, GlobeIcon, GroupsIcon, LockIcon, TrashIcon, UsersIcon } from "./icons";
import { useGroup } from "./groups";
import Comments from "./Comments";

type Props = { entry: Entry; onEdit?: (entry: Entry) => void };

function GroupLink({ id }: { id: string }) {
  const g = useGroup(id);
  if (!g) return null;
  return <li><a href={`#/g/${encodeURIComponent(id)}`}><GroupsIcon />{g.name}</a></li>;
}

const VIS_ICON = { private: <LockIcon />, friends: <UsersIcon />, public: <GlobeIcon /> };

export default function EntryCard({ entry, onEdit }: Props) {
  const s = useSession();
  const ownerUid = entry.ownerUid ?? s.uid;
  const mine = ownerUid === s.uid;
  const owner = useProfile(ownerUid);
  const [photos, setPhotos] = useState<string[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const groupIds = (entry.groupIds ?? []).filter((id) => s.groups.ids.has(id));
  const vis = VISIBILITY.find((v) => v.id === (entry.visibility ?? "private"))!;

  // createdAt/updatedAt change once the server confirms a write, which refreshes photos
  // that were still being committed when the first local snapshot arrived.
  const stamp = `${entry.createdAt?.seconds ?? 0}-${entry.updatedAt?.seconds ?? 0}`;
  useEffect(() => {
    let live = true;
    if (entry.photoCount > 0) {
      loadPhotos(ownerUid, entry.id).then((p) => live && setPhotos(p.map((x) => x.data)), () => {});
    } else {
      setPhotos([]);
    }
    return () => { live = false; };
  }, [ownerUid, entry.id, entry.photoCount, stamp]);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom]);

  async function copy() {
    const text = entryText(entry);
    if (await copyText(text)) s.notify("Entry copied");
    else s.manualCopy(text);
  }

  const expecting = entry.photoCount > 0 && photos.length === 0;
  const name = owner?.displayName || (owner === undefined ? "…" : "VibeBook member");

  return (
    <article className="post">
      <header className="post-head">
        {mine ? <Avatar profile={owner} /> : (
          <a href={`#/u/${encodeURIComponent(ownerUid)}`} aria-label={`${name}'s profile`}><Avatar profile={owner} /></a>
        )}
        <div className="post-who">
          {mine ? <b>{name}</b> : <a className="post-name" href={`#/u/${encodeURIComponent(ownerUid)}`}>{name}</a>}
          <time>{longDay(entry.date)} · {clockTime(entry.time)}</time>
          {groupIds.length > 0 && <ul className="group-links" aria-label="Shared to groups">{groupIds.map((id) => <GroupLink key={id} id={id} />)}</ul>}
        </div>
        {mine && <span className={`vis vis-${vis.id}`} title={vis.hint}>{VIS_ICON[vis.id]}{vis.label}</span>}
      </header>

      <div className="post-body">
        <h2 className="post-title">{entry.title}</h2>
        {entry.description && <p className="post-desc">{entry.description}</p>}
        {entry.skills.length > 0 && (
          <ul className="chips">{entry.skills.map((sk) => <li key={sk}>{sk}</li>)}</ul>
        )}
      </div>

      {expecting && <div className="photo-grid placeholder" aria-hidden="true" />}
      {photos.length > 0 && (
        <div className={`photo-grid ${photos.length % 2 ? "odd" : "even"}`}>
          {photos.map((src, i) => (
            <button key={i} type="button" className="photo-btn" onClick={() => setZoom(src)}
              aria-label={`Open photo ${i + 1} of ${entry.title}`}>
              <img src={src} alt={`${entry.title} photo ${i + 1}`} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className={`post-actions${mine && onEdit ? "" : " single"}`}>
        <button type="button" className="act" onClick={copy}><CopyIcon /><span>Copy</span></button>
        <button type="button" className={`act${commenting ? " on" : ""}`} aria-expanded={commenting}
          onClick={() => setCommenting(!commenting)}><CommentIcon /><span>Comment</span></button>
        {mine && onEdit && (
          <>
            <button type="button" className="act" onClick={() => onEdit(entry)}><EditIcon /><span>Edit</span></button>
            <button type="button" className={`act danger${armed ? " armed" : ""}`}
              onClick={() => {
                if (armed) deleteEntry(ownerUid, entry).then(() => s.notify("Entry deleted"), () => s.notify("Could not delete"));
                else setArmed(true);
              }}>
              <TrashIcon /><span>{armed ? "Tap to confirm" : "Delete"}</span>
            </button>
          </>
        )}
      </div>

      {commenting && <Comments ownerUid={ownerUid} entryId={entry.id} />}

      {zoom && (
        <div className="overlay lightbox" onClick={() => setZoom(null)}>
          <button type="button" className="icon-btn close" aria-label="Close photo"><CloseIcon /></button>
          <img src={zoom} alt={entry.title} />
        </div>
      )}
    </article>
  );
}
