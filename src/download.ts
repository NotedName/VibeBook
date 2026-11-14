/** A file-name-safe version of an entry's title. */
const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "photo";

/** Saves a picture stored as a data URL to the device, as vibebook-<title>-<n>.jpg. Returns false if the browser refused. */
export async function downloadPhoto(dataUrl: string, title: string, n: number): Promise<boolean> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibebook-${slug(title)}-${n}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/** Downloads several pictures one after another (browsers drop downloads fired in the same instant). */
export async function downloadPhotos(photos: { data: string }[], title: string): Promise<boolean> {
  let ok = true;
  for (let i = 0; i < photos.length; i++) {
    ok = (await downloadPhoto(photos[i].data, title, i + 1)) && ok;
    if (i < photos.length - 1) await new Promise((r) => setTimeout(r, 350));
  }
  return ok;
}
