/**
 * Progressive Web App support: VibeBook can be installed to the home screen on Android, iOS and desktop as a second way to use it next to
 * the Android app. The service worker is public/sw.js and the manifest is public/manifest.webmanifest.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

export function startPwa(): void {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; listeners.forEach((f) => f()); });
  window.addEventListener("appinstalled", () => { deferred = null; listeners.forEach((f) => f()); });
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => { /* the app works without it */ }); });
  }
}

export const onInstallChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
/** Opened from the home screen already. */
export const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
/** The browser is ready to show its install prompt. */
export const canPromptInstall = () => deferred !== null;
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null; listeners.forEach((f) => f());
  return choice.outcome === "accepted";
}
