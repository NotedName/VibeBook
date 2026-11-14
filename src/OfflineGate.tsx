import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isNativeApp } from "./platform";
import { hideSplash } from "./splash";
import { BrandName } from "./Logo";

/** A host the app talks to anyway, so reaching it means VibeBook will work. "no-cors" is enough: any answer at all proves there is a connection. */
const PROBE_URL = "https://firestore.googleapis.com/";

async function reachable(): Promise<boolean> {
  if (!navigator.onLine) return false;
  const stop = new AbortController();
  const timer = window.setTimeout(() => stop.abort(), 6000);
  try {
    await fetch(PROBE_URL, { mode: "no-cors", cache: "no-store", signal: stop.signal });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

const WifiOff = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.58 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);

/**
 * In the Android app, VibeBook needs the internet. When there is none (at launch or later) this covers the screen with a clear message
 * and comes away by itself as soon as the connection is back. The app underneath stays mounted, so nothing you were typing is lost.
 * In a normal browser it does nothing.
 */
export default function OfflineGate({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(() => !isNativeApp || navigator.onLine);
  const [checking, setChecking] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);

  useEffect(() => {
    if (!isNativeApp) return;
    const up = () => { setOnline(true); setStillOffline(false); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  // The splash screen would sit on top of this message, so let it go.
  useEffect(() => { if (!online) hideSplash(); }, [online]);

  const retry = useCallback(async () => {
    setChecking(true);
    setStillOffline(false);
    const ok = await reachable();
    setOnline(ok);
    setStillOffline(!ok);
    setChecking(false);
  }, []);

  return (
    <>
      {children}
      {!online && (
        <main className="offline-gate" role="alertdialog" aria-labelledby="offline-title" aria-describedby="offline-text">
          <div className="offline-card">
            <div className="brand"><BrandName /></div>
            <i className="offline-icon"><WifiOff /></i>
            <h1 id="offline-title">Unavailable offline</h1>
            <p id="offline-text">VibeBook needs an internet connection. Connect to Wi-Fi or mobile data, then try again.</p>
            <button type="button" className="btn primary wide" disabled={checking} onClick={retry}>{checking ? "Checking…" : "Try again"}</button>
            <p className="error" role="status" aria-live="polite">{stillOffline ? "Still no connection." : ""}</p>
          </div>
        </main>
      )}
    </>
  );
}
