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

export type StartPage = "feed" | "groups" | "me" | "messages";
export const START_PAGES: { id: StartPage; label: string }[] = [
  { id: "feed", label: "Feed" }, { id: "groups", label: "Groups" }, { id: "me", label: "Logbook" }, { id: "messages", label: "Messages" },
];

type Prefs = {
  /** the page the app opens on when launched without a link to somewhere else */
  startPage: StartPage;
  photo: PhotoQuality; visibility: Visibility; reduceMotion: boolean; /** suggestions from recent activity and skills in the new entry form */ entrySuggestions: boolean;
  /** show group invitations in the bell */
  groupInvites: boolean;
  /** alert in the bell when someone posts in a group you are in */
  groupPosts: boolean;
  /** groups with post alerts turned off */
  mutedGroups: string[];
  /** people whose chats do not add to the unread count in the top bar */
  mutedChats: string[];
  /** does the Enter key send a message? "auto": yes with a keyboard, no on a touch screen (Enter is a new line there) */
  enterSends: "auto" | "on" | "off";
};

const KEY = "vibebook-prefs";
const DEFAULTS: Prefs = { startPage: "feed", photo: "standard", visibility: "private", reduceMotion: false, entrySuggestions: true, groupInvites: true, groupPosts: true, mutedGroups: [], mutedChats: [], enterSends: "auto" };

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
    return {
      startPage: START_PAGES.some((x) => x.id === raw.startPage) ? raw.startPage! : DEFAULTS.startPage,
      photo: PHOTO_QUALITY.some((q) => q.id === raw.photo) ? raw.photo! : DEFAULTS.photo,
      visibility: raw.visibility === "friends" || raw.visibility === "public" ? raw.visibility : DEFAULTS.visibility,
      reduceMotion: raw.reduceMotion === true,
      entrySuggestions: raw.entrySuggestions !== false,
      groupInvites: raw.groupInvites !== false,
      groupPosts: raw.groupPosts !== false,
      mutedGroups: Array.isArray(raw.mutedGroups) ? raw.mutedGroups.filter((g) => typeof g === "string") : [],
      mutedChats: Array.isArray(raw.mutedChats) ? raw.mutedChats.filter((g) => typeof g === "string") : [],
      enterSends: raw.enterSends === "on" || raw.enterSends === "off" ? raw.enterSends : "auto",
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

// Opening the app with no page in the address (a fresh launch, not a link) goes to the page chosen in Settings.
if ((location.hash === "" || location.hash === "#/") && state.startPage !== "feed") {
  try { history.replaceState(null, "", `${location.pathname}${location.search}#/${state.startPage}`); } catch { /* ignore */ }
}

export const photoQuality = () => PHOTO_QUALITY.find((q) => q.id === state.photo)!;
export const defaultVisibility = () => state.visibility;
/** Whether Enter sends a message in a chat (the Send button always does). */
export const enterSendsMessage = () =>
  state.enterSends === "auto" ? !window.matchMedia("(pointer: coarse)").matches : state.enterSends === "on";

/** Back to the defaults, including muted groups and chats. */
export const resetPreferences = () => update(DEFAULTS);

export function usePreferences() {
  const p = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);
  return {
    ...p,
    setStartPage: (startPage: StartPage) => update({ startPage }),
    setPhoto: (photo: PhotoQuality) => update({ photo }),
    setVisibility: (visibility: Visibility) => update({ visibility }),
    setEntrySuggestions: (entrySuggestions: boolean) => update({ entrySuggestions }),
    setReduceMotion: (reduceMotion: boolean) => update({ reduceMotion }),
    setGroupInvites: (groupInvites: boolean) => update({ groupInvites }),
    setGroupPosts: (groupPosts: boolean) => update({ groupPosts }),
    setChatMuted: (uid: string, muted: boolean) =>
      update({ mutedChats: muted ? [...new Set([...state.mutedChats, uid])] : state.mutedChats.filter((g) => g !== uid) }),
    setEnterSends: (enterSends: boolean) => update({ enterSends: enterSends ? "on" : "off" }),
    setGroupMuted: (gid: string, muted: boolean) =>
      update({ mutedGroups: muted ? [...new Set([...state.mutedGroups, gid])] : state.mutedGroups.filter((g) => g !== gid) }),
  };
}
