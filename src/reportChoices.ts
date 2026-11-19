import type { ReportKind } from "./reportDocs";

export type Format = "docx" | "pdf" | "text";

/** What was picked in Export Portfolio (not the dates, which start fresh each time). */
export type ReportChoices = { kinds: ReportKind[]; format: Format; withPhotos: boolean; showHours: boolean; descriptionsOnly: boolean };

export const DEFAULT_CHOICES: ReportChoices = { kinds: ["daily"], format: "docx", withPhotos: true, showHours: false, descriptionsOnly: false };

const KEY = "vibebook.exportChoices";
const KINDS: ReportKind[] = ["daily", "weekly", "period", "plan"];
const FORMATS: Format[] = ["docx", "pdf", "text"];

/** The remembered choices of this device, or the defaults when there are none. */
export function loadChoices(): ReportChoices {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!v) return DEFAULT_CHOICES;
    const kinds = Array.isArray(v.kinds) ? KINDS.filter((k) => v.kinds.includes(k)) : [];
    const valid = kinds.length > 0 && (kinds.length === 1 || !kinds.includes("period"));
    return {
      kinds: valid ? kinds : DEFAULT_CHOICES.kinds,
      format: FORMATS.includes(v.format) ? v.format : DEFAULT_CHOICES.format,
      withPhotos: typeof v.withPhotos === "boolean" ? v.withPhotos : DEFAULT_CHOICES.withPhotos,
      showHours: typeof v.showHours === "boolean" ? v.showHours : DEFAULT_CHOICES.showHours,
      descriptionsOnly: typeof v.descriptionsOnly === "boolean" ? v.descriptionsOnly : DEFAULT_CHOICES.descriptionsOnly,
    };
  } catch { return DEFAULT_CHOICES; }
}

export function saveChoices(c: ReportChoices) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* not remembered, still works */ }
}

export function clearChoices() {
  try { localStorage.removeItem(KEY); } catch { /* nothing was remembered */ }
}
