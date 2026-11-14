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
