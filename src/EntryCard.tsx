import { useEffect, useState } from "react";
import { deleteEntry, loadPhotos, type Entry } from "./entries";

export default function EntryCard({ uid, entry }: { uid: string; entry: Entry }) {
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (entry.photoCount > 0) loadPhotos(uid, entry.id).then(setPhotos);
  }, [uid, entry.id, entry.photoCount]);

  return (
    <article className="card">
      <header>
        <h2>{entry.title}</h2>
        <time>{entry.date} · {entry.time}</time>
      </header>
      {entry.skills.length > 0 && (
        <ul className="skills">{entry.skills.map((s) => <li key={s}>{s}</li>)}</ul>
      )}
      <p>{entry.description}</p>
      {photos.length > 0 && (
        <div className="thumbs">
          {photos.map((src, i) => <img key={i} src={src} alt={`${entry.title} photo ${i + 1}`} />)}
        </div>
      )}
      <button className="link danger"
        onClick={() => confirm("Delete this entry?") && deleteEntry(uid, entry.id)}>
        Delete
      </button>
    </article>
  );
}
