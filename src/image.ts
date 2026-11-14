const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.7;
const MAX_CHARS = 900_000; // Firestore documents are capped at 1 MiB

export async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
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
