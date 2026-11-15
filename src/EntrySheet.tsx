import FormError from "./FormError";
import { ThumbsSkeleton } from "./Skeleton";
import { defaultVisibility } from "./preferences";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { addEntry, DESC_MAX, loadPhotos, MAX_PHOTOS, SKILL_MAX, SKILL_WORDS_MAX, SKILLS_INPUT_MAX, SKILLS_MAX, TITLE_MAX, updateEntry, type Entry, type Photo } from "./entries";
import { nowStr, todayStr } from "./report";
import { CameraIcon, CloseIcon, EditIcon, ImageIcon } from "./icons";
import { useSession } from "./session";
import { chosenVisibility } from "./entryPrivacy";
import { parseVideo, VIDEO_URL_MAX } from "./video";
import PhotoEditor from "./PhotoEditor";
import { GifTab } from "./MediaPicker";
import { isGifFile } from "./image";
import { LinkNotice } from "./links";
import { canAutoFocus } from "./focus";
import { useScrollLock } from "./scrollLock";
import { DropHint, useImageDrop } from "./imageDrop";

const VIDEO_ERROR = "That video link is not supported. Use an https link to YouTube or Vimeo, or a direct .mp4 or .webm file.";

type Props = {
  uid: string;
  entry: Entry | null; // null = new entry
  /** Group to tick for a new entry, e.g. when writing from inside that group. */
  defaultGroupId?: string;
  /** Day for a new entry, e.g. when adding from a day of the month view. */
  defaultDate?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export default function EntrySheet({ uid, entry, defaultGroupId, defaultDate, onClose, onSaved }: Props) {
  const s = useSession();
  // A new entry starts at the moment the sheet opened and the person can change it. Hours are logged with Clock in /
  // Clock out, not here, so an entry being edited keeps the date and time it already has.
  const [date, setDate] = useState(entry?.date ?? defaultDate ?? todayStr());
  const [time, setTime] = useState(entry?.time ?? nowStr());
  const [title, setTitle] = useState(entry?.title ?? "");
  const [skills, setSkills] = useState(entry?.skills.join(", ") ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [videoUrl, setVideoUrl] = useState(entry?.videoUrl ?? "");
  const [gif, setGif] = useState(entry?.gif ?? ""); // a Giphy/Tenor GIF link shown on the post
  const [gifOpen, setGifOpen] = useState(false);
  // Who can see an entry is set in Settings (new entries) and with the entry's ... menu (existing ones), not in this form.
  const visibility = entry ? chosenVisibility(entry) : defaultVisibility();
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
  const skillList = skills.split(",").map((x) => x.trim()).filter(Boolean);
  const skillsOver = skillList.length > SKILLS_MAX
    || skillList.some((x) => x.length > SKILL_MAX || x.split(/\s+/).length > SKILL_WORDS_MAX);

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

  useScrollLock();
  useEffect(() => {
    if (canAutoFocus()) titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  const total = saved.length + files.length;

  function addPicked(picked: File[]) {
    const room = Math.max(0, MAX_PHOTOS - saved.length - files.length);
    if (room === 0) { s.notify(`An entry holds up to ${MAX_PHOTOS} photos.`); return; }
    if (picked.length > room) s.notify(`Only ${MAX_PHOTOS} photos fit. The first ${room} were added.`);
    setFiles((prev) => [...prev, ...picked.slice(0, room)]);
  }
  function addFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same file again
    addPicked(picked);
  }
  // Pictures can also be dragged anywhere onto the form (computers only).
  const { over, bind } = useImageDrop(addPicked, { disabled: busy || !photosReady, onRejected: () => s.notify("Only pictures can be added to an entry.") });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (videoUrl.trim() && !parseVideo(videoUrl)) {
      setError(VIDEO_ERROR);
      return;
    }
    setBusy(true);
    const input = {
      date, time, clockIn: entry?.clockIn ?? "", clockOut: entry?.clockOut ?? "", ...(entry?.breakMinutes ? { breakMinutes: entry.breakMinutes } : {}), title: title.trim(), description: description.trim(), visibility, groupIds,
      videoUrl: videoUrl.trim(), gif,
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
      <form className={`sheet entry-sheet${over ? " drop-over" : ""}`} role="dialog" aria-modal="true"
        aria-label={entry ? "Edit entry" : "New entry"} onSubmit={submit} {...bind}>
        {over && <DropHint />}
        <div className="sheet-head">
          <h2>{entry ? "Edit entry" : "New entry"}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="sheet-body">
          <div className="es-grid">
          <div className="es-media">
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
          <p className="hint">{total}/{MAX_PHOTOS} photos{!photosReady && " · loading saved photos…"}{files.length > 0 && " · tap the pencil to edit a new photo"}<span className="drop-tip"> · or drag photos here</span></p>
          <div className="entry-gif-pick" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault(); }}>
            {gif ? (
              <div className="thumb entry-gif-thumb">
                <img src={gif} alt="Selected GIF" referrerPolicy="no-referrer" />
                <button type="button" aria-label="Remove GIF" onClick={() => setGif("")}>×</button>
              </div>
            ) : (
              <button type="button" className={`btn${gifOpen ? " on" : ""}`} aria-expanded={gifOpen} onClick={() => setGifOpen(!gifOpen)}>
                <ImageIcon /> {gifOpen ? "Close GIFs" : "Add a GIF"}
              </button>
            )}
            {!gif && gifOpen && <GifTab onPick={(m) => { setGif(m.gif); setGifOpen(false); }} />}
            <p className="hint">A moving GIF from Giphy or Tenor. You can also choose a small .gif file as a photo and it keeps moving.</p>
          </div>

          {!photosReady && entry && entry.photoCount > 0 && <ThumbsSkeleton count={Math.min(entry.photoCount, MAX_PHOTOS)} />}
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
                  {!isGifFile(files[i]) && <button type="button" className="thumb-edit" aria-label="Edit photo" onClick={() => setEditing(i)}><EditIcon /></button>}
                </div>
              ))}
            </div>
          )}

          </div>
          <div className="es-fields">
          {!entry && (
            <div className="row">
              <label>Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <label>Time
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
              </label>
            </div>
          )}
          <label>Activity
            <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} required
              maxLength={TITLE_MAX} placeholder="e.g. Set up a new PC in the engineering office" />
          </label>
          <LinkNotice text={title} where="activity" />
          <label><span className="lbl-head">Skills acquired <small className={skillsOver ? "count-warn" : "count"}>{skillList.length}/{SKILLS_MAX} skills</small></span>
            <input value={skills} onChange={(e) => setSkills(e.target.value)} maxLength={SKILLS_INPUT_MAX}
              placeholder="e.g. Networking, Excel, Teamwork" />
            <small className={skillsOver ? "count-warn" : "count"}>Separate with commas. Up to {SKILL_WORDS_MAX} words and {SKILL_MAX} letters each.</small>
          </label>
          <label><span className="lbl-head">Video link <small>(optional)</small></span>
            <input type="url" inputMode="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
              maxLength={VIDEO_URL_MAX} placeholder="e.g. https://youtu.be/abc123" aria-invalid={error === VIDEO_ERROR || undefined} />
          </label>
          {error === VIDEO_ERROR && <FormError>{error}</FormError>}
          <label><span className="lbl-head">Description <small className={description.length > DESC_MAX * 0.9 ? "count-warn" : "count"}>{description.length}/{DESC_MAX}</small></span>
            <textarea ref={descRef} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={DESC_MAX}
              spellCheck lang="en" autoCapitalize="sentences" data-gramm="true"
              placeholder="What happened, what was the problem, how did you solve it?" />
          </label>
          <LinkNotice text={description} where="description" />
          </div>
          </div>

          {!entry && defaultGroupId && s.groups.ids.has(defaultGroupId) && (
            <p className="hint">This entry will also be shared with {s.groups.list.find((g) => g.id === defaultGroupId)?.name ?? "the group"}.</p>
          )}
          {entry && <p className="hint">To change which groups this is shared to, press Share on the post.</p>}

          {error && error !== VIDEO_ERROR && <FormError>{error}</FormError>}
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
