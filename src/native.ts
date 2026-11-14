import { isNativeApp } from "./platform";

export type ImageMode = "photo" | "avatar" | "cover";

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * Asks the app's Rust code to resize, crop and compress a picture (see rust-phase2/). Returns the JPEG as a data URL,
 * or null when that is not possible (a normal browser, the Rust command not added yet, or the picture is too big to store),
 * in which case the caller carries on with the canvas code, so the web version and older app builds keep working.
 * quality is 0 to 1, like canvas.toDataURL.
 */
export async function nativeImage(file: Blob, mode: ImageMode, size: number, quality: number, maxChars: number): Promise<string | null> {
  if (!isNativeApp) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const out = await invoke<ArrayBuffer>("process_image", new Uint8Array(await file.arrayBuffer()), {
      headers: { "x-mode": mode, "x-size": String(Math.round(size)), "x-quality": String(Math.round(quality * 100)), "x-max-chars": String(maxChars) },
    });
    return await toDataUrl(new Blob([out], { type: "image/jpeg" }));
  } catch {
    return null;
  }
}
