import { useSyncExternalStore } from "react";
import type { Visibility } from "./types";

/**
 * Settings that are not about colours or text size (those are in theme.ts): photo quality for uploads, the visibility a new
 * entry starts with, and reduced motion. Saved on this device. Reduced motion is applied as data-motion on <html>.
 */
export type PhotoQuality = "saver" | "standard" | "high";

/** Longest side in pixels and JPEG quality for photos you add to an entry. */
export const PHOTO_QUALITY: { id: PhotoQuality; label: string; side: number; quality: number; hint: string }[] = [
  { id: "saver", label: "Data saver", side: 1024, quality: 0.6, hint: "Smallest photos. Loads fastest, with less detail." },
  { id: "standard", label: "Standard", side: 1280, quality: 0.7, hint: "A good balance of detail and size." },
  { id: "high", label: "High", side: 1600, quality: 0.8, hint: "Most detail. A very busy photo may be shrunk to fit." },
];

type Prefs = {
  photo: PhotoQuality; visibility: Visibility; reduceMotion: boolean;
  /** show group invitations in the bell */
  groupInvites: boolean;
  /** alert in the bell when someone posts in a group you are in */
  groupPosts: boolean;
  /** groups with post alerts turned off */
  mutedGroups: string[];
};

const KEY = "vibebook-prefs";
const DEFAULTS: Prefs = { photo: "standard", visibility: "private", reduceMotion: false, groupInvites: true, groupPosts: true, mutedGroups: [] };

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    return {
      photo: PHOTO_QUALITY.some((q) => q.id === raw.photo) ? raw.photo! : DEFAULTS.photo,
      visibility: raw.visibility === "friends" || raw.visibility === "public" ? raw.visibility : DEFAULTS.visibility,
      reduceMotion: raw.reduceMotion === true,
      groupInvites: raw.groupInvites !== false,
      groupPosts: raw.groupPosts !== false,
      mutedGroups: Array.isArray(raw.mutedGroups) ? raw.mutedGroups.filter((g) => typeof g === "string") : [],
    };
  } catch { return DEFAULTS; }
}

let state = load();
const listeners = new Set<() => void>();

function apply() {
  if (state.reduceMotion) document.documentElement.setAttribute("data-motion", "reduced");
  else document.documentElement.removeAttribute("data-motion");
}

function update(change: Partial<Prefs>) {
  state = { ...state, ...change };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  apply();
  listeners.forEach((l) => l());
}
apply();

export const photoQuality = () => PHOTO_QUALITY.find((q) => q.id === state.photo)!;
export const defaultVisibility = () => state.visibility;

export function usePreferences() {
  const p = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);
  return {
    ...p,
    setPhoto: (photo: PhotoQuality) => update({ photo }),
    setVisibility: (visibility: Visibility) => update({ visibility }),
    setReduceMotion: (reduceMotion: boolean) => update({ reduceMotion }),
    setGroupInvites: (groupInvites: boolean) => update({ groupInvites }),
    setGroupPosts: (groupPosts: boolean) => update({ groupPosts }),
    setGroupMuted: (gid: string, muted: boolean) =>
      update({ mutedGroups: muted ? [...new Set([...state.mutedGroups, gid])] : state.mutedGroups.filter((g) => g !== gid) }),
  };
}
