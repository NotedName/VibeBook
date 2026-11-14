import { isNativeApp } from "./platform";

/** A file-name-safe version of an entry's title. */
const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "photo";

const extOf = (blob: Blob) => blob.type.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "jpg";

/**
 * Inside the Android app a browser download does nothing, so ask the phone where to put the file (its own "Save as" screen)
 * and write the bytes there. Returns false if the person cancelled or the write failed.
 */
async function saveNative(blob: Blob, fileName: string, kind = "Image"): Promise<boolean> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const target = await save({ defaultPath: fileName, filters: [{ name: kind, extensions: [fileName.split(".").pop() || extOf(blob)] }] });
    if (!target) return false; // closed the Save as screen
    await writeFile(target, new Uint8Array(await blob.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

/** Saves a picture stored as a data URL to the device, as vibebook-<title>-<n>.jpg. Returns false if it could not be saved. */
export async function downloadPhoto(dataUrl: string, title: string, n: number): Promise<boolean> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const name = `vibebook-${slug(title)}-${n}.${extOf(blob)}`;
    if (isNativeApp) return await saveNative(blob, name);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/** Saves several pictures one after another (browsers drop downloads fired in the same instant; the app asks for each in turn). */
export async function downloadPhotos(photos: { data: string }[], title: string): Promise<boolean> {
  let ok = true;
  for (let i = 0; i < photos.length; i++) {
    ok = (await downloadPhoto(photos[i].data, title, i + 1)) && ok;
    if (!isNativeApp && i < photos.length - 1) await new Promise((r) => setTimeout(r, 350));
  }
  return ok;
}

/** Saves a generated file (a Word or PDF report) to the device. Returns false if the person cancelled or it could not be saved. */
export async function downloadFile(bytes: Uint8Array, fileName: string, mime: string, kind: string): Promise<boolean> {
  try {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    if (isNativeApp) return await saveNative(blob, fileName, kind);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
