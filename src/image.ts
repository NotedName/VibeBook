import { photoQuality } from "./preferences";

const MAX_CHARS = 900_000; // Firestore documents are capped at 1 MiB

export async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { side, quality } = photoQuality();
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let q = quality;
  let dataUrl = canvas.toDataURL("image/jpeg", q);
  while (dataUrl.length > MAX_CHARS && q > 0.4) { q -= 0.1; dataUrl = canvas.toDataURL("image/jpeg", q); }
  if (dataUrl.length > MAX_CHARS) throw new Error(`${file.name} is too large even after compression`);
  return dataUrl;
}

/** Center-crops to a square and shrinks to a small JPEG data URL for profile photos. */
export async function squareAvatar(file: File, side = 256): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const size = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  canvas.getContext("2d")!.drawImage(
    bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, side, side,
  );
  bitmap.close();
  let quality = 0.85;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > 60_000 && quality > 0.4) { quality -= 0.1; out = canvas.toDataURL("image/jpeg", quality); }
  return out;
}

/** Center-crops to a 3:1 banner and shrinks to a JPEG data URL for the profile cover. */
export async function coverBanner(file: File, width = 900, maxChars = 100_000): Promise<string> {
  const height = width / 3;
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const cropH = Math.min(bitmap.height, bitmap.width / 3);
  const cropW = cropH * 3;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(
    bitmap, (bitmap.width - cropW) / 2, (bitmap.height - cropH) / 2, cropW, cropH, 0, 0, width, height,
  );
  bitmap.close();
  let quality = 0.8;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > maxChars && quality > 0.3) { quality -= 0.1; out = canvas.toDataURL("image/jpeg", quality); }
  if (out.length > maxChars) throw new Error("Cover photo is too detailed to store");
  return out;
}
