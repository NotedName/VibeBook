import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { addEntry, loadPhotos, MAX_PHOTOS, updateEntry, type Entry, type Photo } from "./entries";
import { nowStr, todayStr } from "./report";
import { CameraIcon, CloseIcon, GlobeIcon, ImageIcon, LockIcon, UsersIcon } from "./icons";
import { useSession } from "./session";
import { MAX_GROUPS_PER_ENTRY, VISIBILITY, type Visibility } from "./types";
import { GroupAvatar } from "./GroupRow";

type Props = {
  uid: string;
  entry: Entry | null; // null = new entry
  /** Group to tick for a new entry, e.g. when writing from inside that group. */
  defaultGroupId?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export default function EntrySheet({ uid, entry, defaultGroupId, onClose, onSaved }: Props) {
  const s = useSession();
  const [date, setDate] = useState(entry?.date ?? todayStr());
  const [time, setTime] = useState(entry?.time ?? nowStr());
  const [title, setTitle] = useState(entry?.title ?? "");
  const [skills, setSkills] = useState(entry?.skills.join(", ") ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(entry?.visibility ?? "private");
  const [groupIds, setGroupIds] = useState<string[]>(() =>
    (entry ? entry.groupIds ?? [] : defaultGroupId ? [defaultGroupId] : []).filter((id) => s.groups.ids.has(id)));
  const [saved, setSaved] = useState<Photo[]>([]); // photos already stored on the entry
  const [removed, setRemoved] = useState<string[]>([]);
  const [photosReady, setPhotosReady] = useState(!entry || entry.photoCount === 0);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  // Load once per entry. Depending on the entry object itself would refetch (and undo
  // photo removals) whenever a live snapshot hands us a fresh copy.
  const entryId = entry?.id;
  const hadPhotos = (entry?.photoCount ?? 0) > 0;
  useEffect(() => {
    if (!entryId || !hadPhotos) return;
    let live = true;
    loadPhotos(uid, entryId)
      .then((p) => { if (live) { setSaved(p); setPhotosReady(true); } })
      .catch(() => { if (live) setError("Could not load this entry's photos."); });
    return () => { live = false; };
  }, [uid, entryId, hadPhotos]);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  const total = saved.length + files.length;

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  function addFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same file again
    setFiles((prev) => [...prev, ...picked].slice(0, Math.max(0, MAX_PHOTOS - saved.length)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const input = {
      date, time, title: title.trim(), description: description.trim(), visibility, groupIds,
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (entry) await updateEntry(uid, entry, input, saved, removed, files);
      else await addEntry(uid, input, files);
      onSaved(entry ? "Entry updated" : "Entry saved");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true"
        aria-label={entry ? "Edit entry" : "New entry"} onSubmit={submit}>
        <div className="sheet-head">
          <h2>{entry ? "Edit entry" : "New entry"}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="sheet-body">
          <div className="photo-pick">
            <label className="btn">
              <CameraIcon /> Take photo
              <input type="file" accept="image/*" capture="environment" hidden onChange={addFiles}
                disabled={total >= MAX_PHOTOS} />
            </label>
            <label className="btn">
              <ImageIcon /> Choose photos
              <input type="file" accept="image/*" multiple hidden onChange={addFiles}
                disabled={total >= MAX_PHOTOS} />
            </label>
          </div>
          <p className="hint">{total}/{MAX_PHOTOS} photos{!photosReady && " · loading saved photos…"}</p>

          {(saved.length > 0 || previews.length > 0) && (
            <div className="thumbs">
              {saved.map((p) => (
                <div key={p.id} className="thumb">
                  <img src={p.data} alt="" />
                  <button type="button" aria-label="Remove photo"
                    onClick={() => { setSaved(saved.filter((x) => x.id !== p.id)); setRemoved([...removed, p.id]); }}>×</button>
                </div>
              ))}
              {previews.map((src, i) => (
                <div key={src} className="thumb">
                  <img src={src} alt="" />
                  <button type="button" aria-label="Remove photo"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          )}

          <div className="row">
            <label>Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label>Time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </label>
          </div>
          <label>Activity
            <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} required
              maxLength={140} placeholder="e.g. Set up a new PC in the engineering office" />
          </label>
          <label>Skills acquired <small>(separate with commas)</small>
            <input value={skills} onChange={(e) => setSkills(e.target.value)}
              placeholder="e.g. Hardware troubleshooting, Networking" />
          </label>
          <label>Description
            <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} required
              placeholder="What happened, what was the problem, how did you solve it?" />
          </label>

          <fieldset className="vis-pick">
            <legend>Who can see this</legend>
            <div className="seg">
              {VISIBILITY.map((v) => (
                <label key={v.id} className={visibility === v.id ? "on" : ""}>
                  <input type="radio" name="visibility" value={v.id} checked={visibility === v.id}
                    onChange={() => setVisibility(v.id)} />
                  {v.id === "private" ? <LockIcon /> : v.id === "friends" ? <UsersIcon /> : <GlobeIcon />}
                  {v.label}
                </label>
              ))}
            </div>
            <p className="hint">{VISIBILITY.find((v) => v.id === visibility)!.hint}</p>
          </fieldset>

          <fieldset className="group-pick">
            <legend>Share to groups</legend>
            {s.groups.list.length === 0 ? (
              <p className="hint">You have not joined any groups yet. <a href="#/groups" onClick={onClose}>Find or create one</a>.</p>
            ) : (
              <>
                <ul>
                  {s.groups.list.map((g) => {
                    const on = groupIds.includes(g.id);
                    return (
                      <li key={g.id}>
                        <label className={on ? "on" : ""}>
                          <input type="checkbox" checked={on} onChange={() => toggleGroup(g.id)}
                            disabled={!on && groupIds.length >= MAX_GROUPS_PER_ENTRY} />
                          <GroupAvatar name={g.name} size="sm" />
                          <span>{g.name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="hint">
                  Members of the groups you tick can see and comment on this entry, whatever you chose above.
                  Up to {MAX_GROUPS_PER_ENTRY} groups.
                </p>
              </>
            )}
          </fieldset>

          {error && <p className="error" role="alert">{error}</p>}
        </div>

        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy || !photosReady}>
            {busy ? "Saving…" : "Save entry"}
          </button>
        </div>
      </form>
    </div>
  );
}
