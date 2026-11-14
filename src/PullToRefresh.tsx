import { useEffect, useRef, useState } from "react";

const TRIGGER = 64;   // how far (px) the list must be pulled before letting go refreshes
const MAX_PULL = 110; // the pull stops following the finger here
const MIN_SHOW = 700; // the spinner stays at least this long (ms) so a quick refresh is still noticed
const GIVE_UP = 10000;

/**
 * Pull down from the top of the page to reload a list without reloading the site (touch screens).
 * `onRefresh` should re-read the data; `busy` says whether that is still going on.
 * While the hook is mounted the browser's own pull-to-refresh (which reloads the whole page) is switched off.
 */
export function usePullToRefresh(onRefresh: () => void, busy: boolean) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const state = useRef({ tracking: false, startX: 0, startY: 0, pull: 0, refreshing: false, startedAt: 0 });

  useEffect(() => {
    document.documentElement.classList.add("ptr-on");
    return () => document.documentElement.classList.remove("ptr-on");
  }, []);

  useEffect(() => {
    const st = state.current;
    const atTop = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
    // Never fight a sheet, photo viewer or menu that is open on top of the page.
    const blocked = (t: EventTarget | null) =>
      document.body.style.overflow === "hidden" || (t instanceof Element && !!t.closest(".overlay, .sheet, [role=dialog], .menu"));
    const setPulled = (v: number) => { st.pull = v; setPull(v); };

    const start = (e: TouchEvent) => {
      st.tracking = false;
      if (st.refreshing || e.touches.length !== 1 || !atTop() || blocked(e.target)) return;
      st.tracking = true; st.startX = e.touches[0].clientX; st.startY = e.touches[0].clientY;
    };
    const move = (e: TouchEvent) => {
      if (!st.tracking) return;
      const dy = e.touches[0].clientY - st.startY;
      const dx = e.touches[0].clientX - st.startX;
      if (st.pull === 0 && (Math.abs(dx) > Math.abs(dy) || dy < 0 || !atTop())) { st.tracking = false; return; }
      if (dy <= 0) { setPulled(0); setDragging(false); return; }
      if (e.cancelable) e.preventDefault(); // stops the page itself from scrolling or bouncing while pulling
      setDragging(true);
      setPulled(Math.min(MAX_PULL, dy * 0.5));
    };
    const end = () => {
      if (!st.tracking) return;
      st.tracking = false; setDragging(false);
      if (st.pull >= TRIGGER) {
        st.refreshing = true; st.startedAt = Date.now();
        setRefreshing(true); setPulled(TRIGGER);
        refreshRef.current();
      } else setPulled(0);
    };

    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, []);

  // Finished once the data has loaded again (and the spinner has been seen for a moment).
  useEffect(() => {
    if (!refreshing) return;
    const st = state.current;
    const wait = busy ? GIVE_UP : Math.max(0, MIN_SHOW - (Date.now() - st.startedAt));
    const t = setTimeout(() => { st.refreshing = false; st.pull = 0; setRefreshing(false); setPull(0); }, wait);
    return () => clearTimeout(t);
  }, [refreshing, busy]);

  return { pull, dragging, refreshing };
}

/** The strip that opens above the list while pulling. */
export function PullIndicator({ pull, dragging, refreshing }: { pull: number; dragging: boolean; refreshing: boolean }) {
  const ready = pull >= TRIGGER;
  return (
    <div className={`ptr${dragging ? " dragging" : ""}`} style={{ height: pull }} role="status" aria-live="polite">
      {(pull > 0 || refreshing) && (
        <span className="sr-only">{refreshing ? "Refreshing" : ready ? "Release to refresh" : "Pull to refresh"}</span>
      )}
      <svg className={`ptr-icon${refreshing ? " spin" : ""}${ready && !refreshing ? " ready" : ""}`} viewBox="0 0 24 24" width="22" height="22"
        fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        style={{ opacity: Math.min(1, pull / 40), transform: refreshing ? undefined : `rotate(${Math.min(pull / TRIGGER, 1) * 180}deg)` }}>
        <path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4.5h-4.5" />
      </svg>
    </div>
  );
}
