import { useEffect } from "react";

// Stops the page behind a full-screen overlay from scrolling. Counted, so two overlays open at once
// (a photo over a sheet, say) only release the page when the last one closes. The scrollbar's width is
// kept as padding so the page does not jump sideways when it disappears.
let locks = 0;
let saved = { overflow: "", paddingRight: "" };

export function lockScroll(): () => void {
  const body = document.body;
  if (locks++ === 0) {
    saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) {
      body.style.overflow = saved.overflow;
      body.style.paddingRight = saved.paddingRight;
    }
  };
}

/** Locks page scrolling while the calling component is mounted (and `active`). */
export function useScrollLock(active = true) {
  useEffect(() => (active ? lockScroll() : undefined), [active]);
}
