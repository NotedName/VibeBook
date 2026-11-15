import { collection, doc, getDocs, orderBy, query, serverTimestamp, writeBatch, type WriteBatch } from "firebase/firestore";
import { db } from "./firebase";
import { logActivity } from "./activity";
import { entryTextProblem, MAX_PHOTOS, type EntryInput } from "./entries";
import { chosenVisibility, profileIsPrivate, visibilityFields } from "./entryPrivacy";
import { isGifUrl } from "./stickers";
import type { Visibility } from "./types";

/**
 * Settings > Data & account > Backup. A backup is one JSON file with all of your entries (archived ones too) and their photos.
 * It does not hold comments, reactions, group posts or your profile: those belong to other people as well, or are kept by your account.
 *
 * Restoring is careful and only ever adds or overwrites; it never deletes:
 *  - an entry whose ID already exists gets its text, hours and video/GIF from the backup, and any photos it is missing. Who can see it
 *    (visibility, groups, archive) stays as it is now, because groups may have changed since the backup was made;
 *  - an entry that does not exist yet is created, private to the groups it was in (none) and with the visibility it had.
 */
const FORMAT = "vibebook-backup";
const VERSION = 1;

export type BackupPhoto = { id: string; order: number; data: string };
export type BackupEntry = { id: string; fields: Record<string, unknown>; photos: BackupPhoto[] };
export type BackupFile = { format: typeof FORMAT; version: number; exportedAt: string; entries: BackupEntry[] };
export type RestoreResult = { added: number; updated: number; skipped: number };

const entriesRef = (uid: string) => collection(db, "users", uid, "entries");

/** The stored fields that belong in a backup. Everything else on an entry is bookkeeping that is worked out again. */
const FIELDS = [
  "date", "time", "clockIn", "clockOut", "minutes", "breakMinutes", "hoursOnly", "startEdited", "originalStart", "originalStartDate",
  "title", "skills", "description", "videoUrl", "gif", "archived",
] as const;

export async function buildBackup(uid: string, progress: (done: number, total: number) => void): Promise<BackupFile> {
  const snap = await getDocs(query(entriesRef(uid), orderBy("date", "asc")));
  const entries: BackupEntry[] = [];
  let done = 0;
  progress(0, snap.size);
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown> & { visibility?: Visibility; lockedVisibility?: Visibility };
    const fields: Record<string, unknown> = { visibility: chosenVisibility(data) };
    for (const k of FIELDS) if (data[k] !== undefined && data[k] !== null) fields[k] = data[k];
    const photoSnap = await getDocs(query(collection(d.ref, "photos"), orderBy("order")));
    const photos = photoSnap.docs.map((p) => ({ id: p.id, order: Number(p.data().order) || 0, data: String(p.data().data ?? "") }));
    entries.push({ id: d.id, fields, photos });
    progress(++done, snap.size);
  }
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), entries };
}

/** Reads the text of a backup file. Throws a message for the person if it is not one of ours. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("That file is not a VibeBook backup."); }
  const b = raw as Partial<BackupFile> | null;
  if (!b || b.format !== FORMAT || !Array.isArray(b.entries)) throw new Error("That file is not a VibeBook backup.");
  if (typeof b.version !== "number" || b.version > VERSION) throw new Error("That backup was made by a newer version of VibeBook. Update the app first.");
  if (b.entries.length > 5000) throw new Error("That backup has too many entries to restore at once.");
  return b as BackupFile;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const MAX_PHOTO_CHARS = 950_000; // a Firestore document holds 1 MiB

/** The fields of one backed-up entry, checked. `null` when the entry cannot be restored safely. */
function clean(f: Record<string, unknown> | undefined): (Record<string, unknown> & { visibility: Visibility }) | null {
  if (!f || typeof f !== "object") return null;
  if (!str(f.date, 10) || !DATE.test(f.date) || !str(f.time, 5) || !CLOCK.test(f.time)) return null;
  if (!str(f.title, 140) || !str(f.description, 2000)) return null;
  if (!Array.isArray(f.skills) || !f.skills.every((s) => typeof s === "string")) return null;
  const out: Record<string, unknown> = { date: f.date, time: f.time, title: f.title, description: f.description, skills: f.skills };
  for (const k of ["clockIn", "clockOut", "originalStart"] as const) {
    if (f[k] === undefined) continue;
    if (!str(f[k], 5) || !CLOCK.test(f[k] as string)) return null;
    out[k] = f[k];
  }
  if (f.originalStartDate !== undefined) {
    if (!str(f.originalStartDate, 10) || !DATE.test(f.originalStartDate)) return null;
    out.originalStartDate = f.originalStartDate;
  }
  for (const k of ["minutes", "breakMinutes"] as const) {
    if (f[k] === undefined) continue;
    if (typeof f[k] !== "number" || !Number.isFinite(f[k]) || (f[k] as number) < 0 || (f[k] as number) > 24 * 60) return null;
    out[k] = f[k];
  }
  for (const k of ["hoursOnly", "startEdited", "archived"] as const) if (f[k] === true) out[k] = true;
  out.videoUrl = f.videoUrl === undefined ? "" : f.videoUrl;
  if (!str(out.videoUrl, 500)) return null;
  if (f.gif !== undefined && f.gif !== "") {
    if (!str(f.gif, 300) || !isGifUrl(f.gif)) return null;
    out.gif = f.gif;
  }
  if (!!out.clockIn !== !!out.clockOut) return null;
  const problem = entryTextProblem({ title: out.title as string, description: out.description as string, skills: out.skills as string[], clockIn: out.clockIn as string | undefined, clockOut: out.clockOut as string | undefined } as Pick<EntryInput, "title" | "description" | "skills" | "clockIn" | "clockOut">);
  if (problem) return null;
  const visibility: Visibility = f.visibility === "friends" || f.visibility === "public" ? f.visibility : "private";
  return { ...out, visibility };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_OPS = 400;
const MAX_CHARS = 7_000_000; // keeps one commit well under Firestore's 10 MiB limit

export async function restoreBackup(uid: string, backup: BackupFile, progress: (message: string) => void): Promise<RestoreResult> {
  progress("Reading your current entries…");
  const existing = new Map((await getDocs(entriesRef(uid))).docs.map((d) => [d.id, d.ref]));
  const privateProfile = await profileIsPrivate(uid);
  const result: RestoreResult = { added: 0, updated: 0, skipped: 0 };

  let batch: WriteBatch = writeBatch(db);
  let ops = 0, chars = 0, creates = 0, firstCreateBatch = true;
  let pending = { added: 0, updated: 0 };

  async function flush() {
    if (ops === 0) return;
    if (creates > 0) {
      // The rules only accept new entries together with this stamp, and refuse it when the last one is under 5 seconds old.
      batch.set(doc(db, "rate", uid), { entryAt: serverTimestamp() }, { merge: true });
      if (!firstCreateBatch) await wait(5500);
    }
    await batch.commit();
    if (creates > 0) firstCreateBatch = false;
    result.added += pending.added;
    result.updated += pending.updated;
    batch = writeBatch(db);
    ops = 0; chars = 0; creates = 0; pending = { added: 0, updated: 0 };
  }

  const total = backup.entries.length;
  let n = 0;
  for (const entry of backup.entries) {
    n++;
    const fields = ID.test(String(entry.id)) ? clean(entry.fields) : null;
    if (!fields) { result.skipped++; continue; }
    const photos = (Array.isArray(entry.photos) ? entry.photos : [])
      .filter((p) => p && ID.test(String(p.id)) && typeof p.data === "string" && p.data.startsWith("data:image/") && p.data.length <= MAX_PHOTO_CHARS)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    const ref = existing.get(entry.id) ?? doc(entriesRef(uid), entry.id);
    const isNew = !existing.has(entry.id);
    const { visibility, archived, ...content } = fields;

    // Which photos the entry has now, so the count stays right and there are never more than MAX_PHOTOS.
    const have = new Set<string>();
    if (!isNew && photos.length > 0) (await getDocs(collection(ref, "photos"))).forEach((p) => have.add(p.id));
    const toWrite: BackupPhoto[] = [];
    for (const p of photos) {
      if (have.has(p.id)) toWrite.push(p);
      else if (have.size + toWrite.filter((w) => !have.has(w.id)).length < MAX_PHOTOS) toWrite.push(p);
    }
    const photoCount = new Set([...have, ...toWrite.map((p) => p.id)]).size;
    const size = toWrite.reduce((sum, p) => sum + p.data.length, 0);
    if (ops > 0 && (ops + 1 + toWrite.length > MAX_OPS || chars + size > MAX_CHARS)) await flush();

    progress(`Restoring entries… ${n} of ${total}`);
    if (isNew) {
      batch.set(ref, { ...content, ...visibilityFields(visibility, false, true, privateProfile), ...(archived ? { archived: true } : {}), groupIds: [], photoCount, createdAt: serverTimestamp() });
      creates++; pending.added++;
    } else {
      batch.set(ref, { ...content, ...(photos.length > 0 ? { photoCount } : {}) }, { merge: true });
      pending.updated++;
    }
    toWrite.forEach((p) => batch.set(doc(collection(ref, "photos"), p.id), { data: p.data, order: Number(p.order) || 0 }));
    ops += 1 + toWrite.length; chars += size;
    if (creates > 0) existing.set(entry.id, ref);
  }
  progress("Saving…");
  await flush();
  logActivity(uid, `Restored ${result.added + result.updated} ${result.added + result.updated === 1 ? "entry" : "entries"} from a backup`);
  return result;
}
