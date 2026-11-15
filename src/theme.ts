import { useSyncExternalStore } from "react";
import { isNativeApp } from "./platform";

/**
 * Appearance settings: colour mode (light, dark, AMOLED, system), accent colour, text size, honeycomb, bold text, high contrast,
 * underlined links and square corners. Saved on this device and applied as attributes on <html> (data-theme, data-amoled,
 * data-accent, data-text-size, data-honey, data-bold, data-contrast, data-links, data-corners) that styles.css reads.
 * index.html applies the same saved values before first paint, so keep the keys and the attribute names in sync with the script there.
 */
export type ThemeMode = "system" | "light" | "dark" | "amoled";

/** Accent colours. "purple" is the original look (no attribute). "custom" uses the colour picked in Settings. */
export const ACCENTS = [
  { id: "purple", label: "Purple", color: "#7e49b3" },
  { id: "blue", label: "Blue", color: "#2f6fd6" },
  { id: "teal", label: "Teal", color: "#0b7f7a" },
  { id: "green", label: "Green", color: "#2a7d46" },
  { id: "orange", label: "Orange", color: "#b85a12" },
  { id: "red", label: "Red", color: "#c93a45" },
  { id: "pink", label: "Pink", color: "#c2408f" },
] as const;
export type AccentId = (typeof ACCENTS)[number]["id"] | "custom";
const DEFAULT_CUSTOM = "#7e49b3";

export const TEXT_SIZES = ["Smallest", "Small", "Default", "Large", "Largest"] as const;
const DEFAULT_TEXT_SIZE = 2;

export type HoneyStyle = "classic" | "fine" | "large" | "bold" | "cells" | "dots" | "off";
export const HONEY_STYLES: { id: HoneyStyle; label: string }[] = [
  { id: "classic", label: "Classic" }, { id: "fine", label: "Fine" }, { id: "large", label: "Large" },
  { id: "bold", label: "Bold" }, { id: "cells", label: "Cells" }, { id: "dots", label: "Dots" }, { id: "off", label: "None" },
];

type Appearance = {
  mode: ThemeMode; textSize: number; honey: HoneyStyle; accent: AccentId; customAccent: string;
  bold: boolean; contrast: boolean; underlineLinks: boolean; squareCorners: boolean;
};

const MODE_KEY = "vibebook-theme"; // "light" | "dark" | "amoled" | "system"
const AMOLED_KEY = "vibebook-amoled"; // older versions kept AMOLED as its own switch; it is still written (on when mode is amoled) so they agree
const ACCENT_KEY = "vibebook-accent";
const CUSTOM_ACCENT_KEY = "vibebook-accent-custom";
const BOLD_KEY = "vibebook-bold";
const CONTRAST_KEY = "vibebook-contrast";
const LINKS_KEY = "vibebook-underline-links";
const CORNERS_KEY = "vibebook-square-corners";
const SIZE_KEY = "vibebook-text-size";
const HONEY_KEY = "vibebook-honey";
const SYSTEM_LIGHT_KEY = "vibebook-system-light"; // the device's last settled answer, read by index.html before first paint
const lightQuery = window.matchMedia("(prefers-color-scheme: light)");
// In the Android app the WebView may say "light" for its first moment and then correct itself. Until it settles (a change event, or a
// short wait with no change), the last answer it settled on is used, so "System" does not flash light and then flip to dark.
let settled = !isNativeApp;
function systemLight(): boolean {
  if (!settled) return read(SYSTEM_LIGHT_KEY) === "1";
  return lightQuery.matches;
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

const isHex = (v: string | null): v is string => v !== null && /^#[0-9a-f]{6}$/i.test(v);

/** White or near-black text, whichever reads better on this colour. */
function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#141414" : "#ffffff";
}

function load(): Appearance {
  const saved = read(MODE_KEY);
  const size = Number(read(SIZE_KEY));
  const accent = read(ACCENT_KEY);
  // An older version saved dark + the AMOLED switch; that is now the AMOLED mode.
  const mode: ThemeMode = saved === "light" || saved === "amoled" ? saved
    : saved === "dark" ? (read(AMOLED_KEY) === "on" ? "amoled" : "dark") : "system";
  const custom = read(CUSTOM_ACCENT_KEY);
  return {
    mode,
    accent: accent === "custom" || ACCENTS.some((a) => a.id === accent) ? (accent as AccentId) : "purple",
    customAccent: isHex(custom) ? custom.toLowerCase() : DEFAULT_CUSTOM,
    bold: read(BOLD_KEY) === "on",
    contrast: read(CONTRAST_KEY) === "on",
    underlineLinks: read(LINKS_KEY) === "on",
    squareCorners: read(CORNERS_KEY) === "on",
    textSize: Number.isInteger(size) && size >= 0 && size < TEXT_SIZES.length ? size : DEFAULT_TEXT_SIZE,
    honey: HONEY_STYLES.some((h) => h.id === read(HONEY_KEY)) ? (read(HONEY_KEY) as HoneyStyle) : "classic",
  };
}

/** What is actually on screen: "system" follows the device. */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? (systemLight() ? "light" : "dark") : mode === "amoled" ? "dark" : mode;
}

let state = load();
const listeners = new Set<() => void>();

function flag(root: HTMLElement, name: string, value: string | null) {
  if (value === null) root.removeAttribute(name); else root.setAttribute(name, value);
}

function apply() {
  const root = document.documentElement;
  const theme = resolveTheme(state.mode);
  root.setAttribute("data-theme", theme);
  const amoled = state.mode === "amoled";
  if (amoled) root.setAttribute("data-amoled", "on"); else root.removeAttribute("data-amoled");
  root.setAttribute("data-text-size", String(state.textSize));
  root.setAttribute("data-honey", state.honey);
  flag(root, "data-accent", state.accent === "purple" ? null : state.accent);
  // A custom colour is set directly; the presets and the lighter/darker shades derived from either are in styles.css.
  if (state.accent === "custom") {
    root.style.setProperty("--accent", state.customAccent);
    root.style.setProperty("--accent-ink", inkFor(state.customAccent));
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-ink");
  }
  flag(root, "data-bold", state.bold ? "on" : null);
  flag(root, "data-contrast", state.contrast ? "high" : null);
  flag(root, "data-links", state.underlineLinks ? "underline" : null);
  flag(root, "data-corners", state.squareCorners ? "square" : null);
  const bar = theme === "light" ? "#f3f2f5" : amoled ? "#000000" : "#1e1c23";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bar);
}

function update(change: Partial<Appearance>) {
  state = { ...state, ...change };
  write(MODE_KEY, state.mode);
  write(AMOLED_KEY, state.mode === "amoled" ? "on" : "off");
  write(SIZE_KEY, String(state.textSize));
  write(HONEY_KEY, state.honey);
  write(ACCENT_KEY, state.accent);
  write(CUSTOM_ACCENT_KEY, state.customAccent);
  write(BOLD_KEY, state.bold ? "on" : "off");
  write(CONTRAST_KEY, state.contrast ? "on" : "off");
  write(LINKS_KEY, state.underlineLinks ? "on" : "off");
  write(CORNERS_KEY, state.squareCorners ? "on" : "off");
  apply();
  listeners.forEach((l) => l());
}

// "System" has to follow the device when it flips between light and dark while the app is open.
function settle() {
  settled = true;
  write(SYSTEM_LIGHT_KEY, lightQuery.matches ? "1" : "0");
  if (state.mode !== "system") return;
  apply();
  listeners.forEach((l) => l());
}
lightQuery.addEventListener("change", settle);
if (!settled) window.setTimeout(() => { if (!settled) settle(); }, 1200);
else write(SYSTEM_LIGHT_KEY, lightQuery.matches ? "1" : "0");
apply();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Back to the defaults: follow the device, purple accent, default text size, no extras. */
export const resetAppearance = () => update({
  mode: "system", textSize: DEFAULT_TEXT_SIZE, honey: "classic", accent: "purple", customAccent: DEFAULT_CUSTOM,
  bold: false, contrast: false, underlineLinks: false, squareCorners: false,
});

export function useAppearance() {
  const a = useSyncExternalStore(subscribe, () => state);
  return {
    ...a,
    theme: resolveTheme(a.mode),
    setMode: (mode: ThemeMode) => update({ mode }),
    setTextSize: (textSize: number) => update({ textSize }),
    setHoney: (honey: HoneyStyle) => update({ honey }),
    setAccent: (accent: AccentId) => update({ accent }),
    /** Picking a colour with the colour picker also switches to it. */
    setCustomAccent: (hex: string) => isHex(hex) && update({ accent: "custom", customAccent: hex.toLowerCase() }),
    setBold: (bold: boolean) => update({ bold }),
    setContrast: (contrast: boolean) => update({ contrast }),
    setUnderlineLinks: (underlineLinks: boolean) => update({ underlineLinks }),
    setSquareCorners: (squareCorners: boolean) => update({ squareCorners }),
  };
}
