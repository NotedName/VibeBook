import { useEffect, useState } from "react";
import { deleteEntry, loadPhotos, type Entry } from "./entries";
import { clockTime, copyText, entryText, initials, longDay } from "./report";
import { CloseIcon, CopyIcon, EditIcon, TrashIcon } from "./icons";

type Props = {
  uid: string;
  name: string;
  entry: Entry;
  onEdit: (entry: Entry) => void;
  onNotice: (message: string) => void;
  onManualCopy: (text: string) => void;
};

export default function EntryCard({ uid, name, entry, onEdit, onNotice, onManualCopy }: Props) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  // createdAt/updatedAt change once the server confirms a write, which refreshes photos
  // that were still being committed when the first local snapshot arrived.
  const stamp = `${entry.createdAt?.seconds ?? 0}-${entry.updatedAt?.seconds ?? 0}`;
  useEffect(() => {
    let live = true;
    if (entry.photoCount > 0) {
      loadPhotos(uid, entry.id).then((p) => live && setPhotos(p.map((x) => x.data)));
    } else {
      setPhotos([]);
    }
    return () => { live = false; };
  }, [uid, entry.id, entry.photoCount, stamp]);

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
    if (await copyText(text)) onNotice("Entry copied");
    else onManualCopy(text);
  }

  const expecting = entry.photoCount > 0 && photos.length === 0;

  return (
    <article className="post">
      <header className="post-head">
        <div className="avatar-sm" aria-hidden="true">{initials(name)}</div>
        <div className="post-who">
          <b>{name}</b>
          <time>{longDay(entry.date)} · {clockTime(entry.time)}</time>
        </div>
      </header>

      <div className="post-body">
        <h2 className="post-title">{entry.title}</h2>
        {entry.description && <p className="post-desc">{entry.description}</p>}
        {entry.skills.length > 0 && (
          <ul className="chips">{entry.skills.map((s) => <li key={s}>{s}</li>)}</ul>
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

      <div className="post-actions">
        <button type="button" className="act" onClick={copy}><CopyIcon /><span>Copy</span></button>
        <button type="button" className="act" onClick={() => onEdit(entry)}><EditIcon /><span>Edit</span></button>
        <button type="button" className={`act danger${armed ? " armed" : ""}`}
          onClick={() => {
            if (armed) { deleteEntry(uid, entry.id).then(() => onNotice("Entry deleted"), () => onNotice("Could not delete")); }
            else setArmed(true);
          }}>
          <TrashIcon /><span>{armed ? "Tap to confirm" : "Delete"}</span>
        </button>
      </div>

      {zoom && (
        <div className="overlay lightbox" onClick={() => setZoom(null)}>
          <button type="button" className="icon-btn close" aria-label="Close photo"><CloseIcon /></button>
          <img src={zoom} alt={entry.title} />
        </div>
      )}
    </article>
  );
}
