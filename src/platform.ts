/** True inside the Android app (Tauri), false in a normal browser. Tauri puts this object on the page before any script runs. */
export const isNativeApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The public website, used for links people share. Set VITE_PUBLIC_URL in .env if your site address is different. */
const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || "https://vibebook.web.app/";

/**
 * Start of a link to share. In a browser that is the page you are on. In the app the page's own address is private to the app
 * (https://tauri.localhost), so a link built from it would be useless to anyone else; use the public website instead.
 */
export const shareBase = (): string =>
  isNativeApp ? PUBLIC_URL.replace(/\/?$/, "/") : `${location.origin}${location.pathname}`;
