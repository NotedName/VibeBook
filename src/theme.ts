import { useSyncExternalStore } from "react";
import { isNativeApp } from "./platform";

/**
 * Appearance settings: colour mode, AMOLED black and text size. Saved on this device and applied as attributes on <html>
 * (data-theme, data-amoled, data-text-size) that styles.css reads. index.html applies the same saved values before first
 * paint, so keep the keys and the attribute names in sync with the script there.
 */
export type ThemeMode = "system" | "light" | "dark";

export const TEXT_SIZES = ["Smallest", "Small", "Default", "Large", "Largest"] as const;
const DEFAULT_TEXT_SIZE = 2;

export type HoneyStyle = "classic" | "fine" | "large" | "bold" | "cells" | "dots" | "off";
export const HONEY_STYLES: { id: HoneyStyle; label: string }[] = [
  { id: "classic", label: "Classic" }, { id: "fine", label: "Fine" }, { id: "large", label: "Large" },
  { id: "bold", label: "Bold" }, { id: "cells", label: "Cells" }, { id: "dots", label: "Dots" }, { id: "off", label: "None" },
];

type Appearance = { mode: ThemeMode; amoled: boolean; textSize: number; honey: HoneyStyle };

const MODE_KEY = "vibebook-theme";
const AMOLED_KEY = "vibebook-amoled";
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

function load(): Appearance {
  const mode = read(MODE_KEY);
  const size = Number(read(SIZE_KEY));
  return {
    mode: mode === "light" || mode === "dark" ? mode : "system",
    amoled: read(AMOLED_KEY) === "on",
    textSize: Number.isInteger(size) && size >= 0 && size < TEXT_SIZES.length ? size : DEFAULT_TEXT_SIZE,
    honey: HONEY_STYLES.some((h) => h.id === read(HONEY_KEY)) ? (read(HONEY_KEY) as HoneyStyle) : "classic",
  };
}

/** What is actually on screen: "system" follows the device. */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? (systemLight() ? "light" : "dark") : mode;
}

let state = load();
const listeners = new Set<() => void>();

function apply() {
  const root = document.documentElement;
  const theme = resolveTheme(state.mode);
  root.setAttribute("data-theme", theme);
  if (state.amoled) root.setAttribute("data-amoled", "on"); else root.removeAttribute("data-amoled");
  root.setAttribute("data-text-size", String(state.textSize));
  root.setAttribute("data-honey", state.honey);
  const bar = theme === "light" ? "#f3f2f5" : state.amoled ? "#000000" : "#1e1c23";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bar);
}

function update(change: Partial<Appearance>) {
  state = { ...state, ...change };
  write(MODE_KEY, state.mode);
  write(AMOLED_KEY, state.amoled ? "on" : "off");
  write(SIZE_KEY, String(state.textSize));
  write(HONEY_KEY, state.honey);
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

/** Back to the defaults: follow the device, no AMOLED black, default text size. */
export const resetAppearance = () => update({ mode: "system", amoled: false, textSize: DEFAULT_TEXT_SIZE, honey: "classic" });

export function useAppearance() {
  const a = useSyncExternalStore(subscribe, () => state);
  return {
    ...a,
    theme: resolveTheme(a.mode),
    setMode: (mode: ThemeMode) => update({ mode }),
    setAmoled: (amoled: boolean) => update({ amoled }),
    setTextSize: (textSize: number) => update({ textSize }),
    setHoney: (honey: HoneyStyle) => update({ honey }),
  };
}
