import type { ReportImage } from "./reportDocs";

/**
 * Turns a stored photo (a data URL) into a JPEG with its size, ready for a Word or PDF report. Photos are saved as JPEG,
 * so they are used as they are; anything else is redrawn onto white and re-encoded. Returns null when it cannot be read.
 */
export async function toReportImage(dataUrl: string): Promise<ReportImage | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    if (blob.type === "image/jpeg") {
      bitmap.close();
      return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const jpeg = await (await fetch(canvas.toDataURL("image/jpeg", 0.85))).blob();
    return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width, height };
  } catch {
    return null;
  }
}
