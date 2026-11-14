import { useEffect } from "react";

// Stops the page behind a full-screen overlay from scrolling. Counted, so two overlays open at once
// (a photo over a sheet, say) only release the page when the last one closes.
//
// `overflow: hidden` on <body> is not enough on phones: iOS Safari ignores it and the page behind a sheet
// still scrolls under your thumb. So the body is pinned with `position: fixed` at the current scroll offset
// and put back where it was on release. `overflow: hidden` stays too (PullToRefresh looks for it). The
// scrollbar's width is kept as padding so the page does not jump sideways when it disappears on desktop.
let locks = 0;
let saved = { overflow: "", paddingRight: "", position: "", top: "", left: "", right: "", width: "" };
let scrollY = 0;

export function lockScroll(): () => void {
  const body = document.body;
  if (locks++ === 0) {
    const s = body.style;
    saved = { overflow: s.overflow, paddingRight: s.paddingRight, position: s.position, top: s.top, left: s.left, right: s.right, width: s.width };
    scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    s.overflow = "hidden";
    s.position = "fixed";
    s.top = `-${scrollY}px`;
    s.left = "0";
    s.right = "0";
    s.width = "100%";
    if (gap > 0) s.paddingRight = `${gap}px`;
    document.documentElement.classList.add("scroll-locked");
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) {
      Object.assign(body.style, saved);
      document.documentElement.classList.remove("scroll-locked");
      window.scrollTo(0, scrollY);
    }
  };
}

/** Locks page scrolling while the calling component is mounted (and `active`). */
export function useScrollLock(active = true) {
  useEffect(() => (active ? lockScroll() : undefined), [active]);
}
