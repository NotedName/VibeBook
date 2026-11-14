import { defaultVisibility } from "./preferences";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { addEntry, loadPhotos, MAX_PHOTOS, updateEntry, type Entry, type Photo } from "./entries";
import { clockTime, longDay, nowStr, todayStr } from "./report";
import { CameraIcon, ClockIcon, CloseIcon, EditIcon, GlobeIcon, ImageIcon, LockIcon, SmileIcon, UsersIcon } from "./icons";
import { useSession } from "./session";
import { VISIBILITY, type Visibility } from "./types";
import { parseVideo, VIDEO_URL_MAX } from "./video";
import PhotoEditor from "./PhotoEditor";
import EmojiPicker from "./EmojiPicker";
import { insertEmoji } from "./emoji";

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
  // Date and time are stamped when the sheet opens and kept as they were when editing; never typed in.
  const [{ date, time }] = useState(() => ({ date: entry?.date ?? todayStr(), time: entry?.time ?? nowStr() }));
  const [title, setTitle] = useState(entry?.title ?? "");
  const [skills, setSkills] = useState(entry?.skills.join(", ") ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [videoUrl, setVideoUrl] = useState(entry?.videoUrl ?? "");
  const [visibility, setVisibility] = useState<Visibility>(entry?.visibility ?? defaultVisibility());
  // Groups are chosen with Share on the post, not here. A new entry started inside a group goes to that group,
  // and an entry being edited keeps the groups it is already shared to.
  const [groupIds] = useState<string[]>(() =>
    (entry ? entry.groupIds ?? [] : defaultGroupId ? [defaultGroupId] : []).filter((id) => s.groups.ids.has(id)));
  const [saved, setSaved] = useState<Photo[]>([]); // photos already stored on the entry
  const [removed, setRemoved] = useState<string[]>([]);
  const [photosReady, setPhotosReady] = useState(!entry || entry.photoCount === 0);
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<number | null>(null); // index in files of the photo being edited
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  // emoji go into whichever of the two text fields was used last
  const lastField = useRef<"title" | "description">("title");
  const [emojiOpen, setEmojiOpen] = useState(false);
  function addEmoji(e: string) {
    if (lastField.current === "title") insertEmoji(titleRef.current, title, e, setTitle, 140);
    else insertEmoji(descRef.current, description, e, setDescription);
  }

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

  function addFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same file again
    setFiles((prev) => [...prev, ...picked].slice(0, Math.max(0, MAX_PHOTOS - saved.length)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (videoUrl.trim() && !parseVideo(videoUrl)) {
      setError("That video link is not supported. Use an https link to YouTube or Vimeo, or a direct .mp4 or .webm file.");
      return;
    }
    setBusy(true);
    const input = {
      date, time, title: title.trim(), description: description.trim(), visibility, groupIds,
      videoUrl: videoUrl.trim(),
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
          <p className="hint">{total}/{MAX_PHOTOS} photos{!photosReady && " · loading saved photos…"}{files.length > 0 && " · tap the pencil on a new photo to crop or adjust it"}</p>

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
                  <button type="button" className="thumb-edit" aria-label="Edit photo" onClick={() => setEditing(i)}><EditIcon /></button>
                </div>
              ))}
            </div>
          )}

          {/* New entries are stamped silently on save; only an existing entry shows when it was logged. */}
          {entry && <p className="stamp"><ClockIcon />{longDay(date)} · {clockTime(time)}<small>Logged</small></p>}
          <label>Activity
            <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} required onFocus={() => { lastField.current = "title"; }}
              maxLength={140} placeholder="e.g. Set up a new PC in the engineering office" />
          </label>
          <label>Skills acquired <small>(separate with commas)</small>
            <input value={skills} onChange={(e) => setSkills(e.target.value)}
              placeholder="e.g. Hardware troubleshooting, Networking" />
          </label>
          <label>Video link <small>(optional)</small>
            <input type="url" inputMode="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
              maxLength={VIDEO_URL_MAX} placeholder="https://youtu.be/… or a Vimeo / .mp4 link" />
          </label>
          <label>Description
            <textarea ref={descRef} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} required
              onFocus={() => { lastField.current = "description"; }}
              placeholder="What happened, what was the problem, how did you solve it?" />
          </label>
          <div className="emoji-field">
            <button type="button" className={`btn small${emojiOpen ? " on" : ""}`} aria-expanded={emojiOpen}
              onClick={() => setEmojiOpen(!emojiOpen)}><SmileIcon /> Emoji</button>
            {emojiOpen && <div className="media-picker"><EmojiPicker onPick={addEmoji} /></div>}
          </div>

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

          {!entry && defaultGroupId && s.groups.ids.has(defaultGroupId) && (
            <p className="hint">This entry will also be shared with {s.groups.list.find((g) => g.id === defaultGroupId)?.name ?? "the group"}.</p>
          )}
          {entry && <p className="hint">To change which groups this is shared to, press Share on the post.</p>}

          {error && <p className="error" role="alert">{error}</p>}
        </div>

        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy || !photosReady}>
            {busy ? "Saving…" : "Save entry"}
          </button>
        </div>
      </form>
      {editing !== null && files[editing] && (
        <PhotoEditor file={files[editing]} onCancel={() => setEditing(null)}
          onApply={(edited) => { setFiles(files.map((x, i) => (i === editing ? edited : x))); setEditing(null); }} />
      )}
    </div>
  );
}
