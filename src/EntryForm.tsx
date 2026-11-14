import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { addEntry, MAX_PHOTOS } from "./entries";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
const now = () => new Date().toTimeString().slice(0, 5); // HH:mm, local time

export default function EntryForm({ uid }: { uid: string }) {
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(now());
  const [title, setTitle] = useState("");
  const [skills, setSkills] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  function addFiles(e: ChangeEvent<HTMLInputElement>) {
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    e.target.value = ""; // allow picking the same file again
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await addEntry(
        uid,
        {
          date, time, title, description,
          skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        },
        files,
      );
      setTitle(""); setSkills(""); setDescription(""); setFiles([]);
      setDate(today()); setTime(now());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="entry-form" onSubmit={submit}>
      <div className="row">
        <label>Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>Time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
      </div>
      <label>Activity title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>Skills acquired <small>(separate with commas)</small>
        <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Git, SQL, client communication" />
      </label>
      <label>Description
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} required />
      </label>

      <div className="photos">
        <label className="button">Upload photos
          <input type="file" accept="image/*" multiple hidden onChange={addFiles} />
        </label>
        <label className="button">Take a photo
          <input type="file" accept="image/*" capture="environment" hidden onChange={addFiles} />
        </label>
        <small>{files.length}/{MAX_PHOTOS}</small>
      </div>
      {previews.length > 0 && (
        <div className="thumbs">
          {previews.map((src, i) => (
            <div key={src} className="thumb">
              <img src={src} alt="" />
              <button type="button" aria-label="Remove photo"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Posting…" : "Post entry"}</button>
    </form>
  );
}
