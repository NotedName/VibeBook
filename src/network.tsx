import { useSyncExternalStore } from "react";

/** Whether the device thinks it is online. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; },
    () => navigator.onLine,
  );
}

/**
 * Shown instead of "not found" when the answer could not be loaded because the network or the server cannot be reached.
 * "Not found" is only for a lookup that really came back empty.
 */
export function NetworkUnavailable({ back }: { back?: { href: string; label: string } }) {
  return (
    <div className="empty network-unavailable" role="alert">
      <h2>Network unavailable</h2>
      <p>VibeBook cannot reach the server right now. Check your connection and try again.</p>
      <div className="empty-actions">
        <button type="button" className="btn primary" onClick={() => location.reload()}>Try again</button>
        {back && <a className="btn" href={back.href}>{back.label}</a>}
      </div>
    </div>
  );
}

/** A thin bar for screens that keep showing a skeleton while waiting for the network. */
export function NetworkBanner() {
  return <p className="net-banner" role="status">Network unavailable. Waiting to reconnect…</p>;
}
