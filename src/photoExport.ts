import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Settings > Data & account > Download all photos: every photo on your entries (archived ones too) in one .zip.
 * Photos are already compressed, so the zip only stores them (no compression), which keeps this small and dependency-free.
 */
const slug = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "entry";

let table: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type ZipFile = { name: string; bytes: Uint8Array };

function makeZip(files: ZipFile[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true);
    local.setUint32(18, f.bytes.length, true); local.setUint32(22, f.bytes.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, f.bytes);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true); cd.setUint16(14, dosDate, true); cd.setUint32(16, crc, true);
    cd.setUint32(20, f.bytes.length, true); cd.setUint32(24, f.bytes.length, true); cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.bytes.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

const fromDataUrl = (url: string): { bytes: Uint8Array; ext: string } | null => {
  const m = /^data:image\/([a-z0-9.+-]+);base64,(.*)$/i.exec(url);
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, ext: m[1].toLowerCase().replace("jpeg", "jpg") };
  } catch { return null; }
};

/** Collects every photo of yours into one zip. `count` is 0 when there are none. */
export async function buildPhotoZip(uid: string, progress: (done: number, total: number) => void): Promise<{ zip: Uint8Array; count: number }> {
  const snap = await getDocs(query(collection(db, "users", uid, "entries"), orderBy("date", "asc")));
  const files: ZipFile[] = [];
  const used = new Set<string>();
  let done = 0;
  progress(0, snap.size);
  for (const d of snap.docs) {
    const data = d.data() as { date?: string; title?: string };
    const photos = await getDocs(query(collection(d.ref, "photos"), orderBy("order")));
    let n = 0;
    for (const p of photos.docs) {
      const img = fromDataUrl(String(p.data().data ?? ""));
      if (!img) continue;
      n++;
      let name = `${data.date ?? "undated"}_${slug(data.title ?? "")}_${n}.${img.ext}`;
      for (let k = 2; used.has(name); k++) name = `${data.date ?? "undated"}_${slug(data.title ?? "")}_${d.id.slice(0, 4)}_${n}-${k}.${img.ext}`;
      used.add(name);
      files.push({ name, bytes: img.bytes });
    }
    progress(++done, snap.size);
  }
  return { zip: files.length ? makeZip(files) : new Uint8Array(), count: files.length };
}
