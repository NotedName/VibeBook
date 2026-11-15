/** Turns whatever went wrong while making a report into a sentence for the person. */

/** A message that is already written for the person; shown as it is. */
export class ExportError extends Error {}

export type ExportFailure = { message: string };

export function describeExportError(err: unknown): ExportFailure {
  if (err instanceof ExportError) return { message: err.message };
  const code = (err as { code?: string } | null)?.code ?? "";
  const name = err instanceof Error ? err.name : "";
  if (code === "permission-denied") return { message: "VibeBook was not allowed to read your photos. Sign out and back in, then try again." };
  if (code === "unavailable" || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return { message: "There is no connection, so your photos could not be loaded. Check your internet and try again." };
  }
  if (name === "RangeError" || name === "QuotaExceededError" || /out of memory|allocation|array buffer/i.test(err instanceof Error ? err.message : "")) {
    return { message: "This report is too big for your device to build. Turn off “Include photos” or pick fewer days." };
  }
  const detail = err instanceof Error && err.message ? ` (${err.message.slice(0, 140)})` : "";
  return { message: `The report could not be made.${detail} Try again, and if it keeps happening, turn off “Include photos”.` };
}
