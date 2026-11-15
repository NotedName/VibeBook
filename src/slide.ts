import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Sliding motion shared by every set of tabs (Material 3 "shared axis"): the highlight glides to the new tab, and the content
 * leaves and arrives along the same horizontal axis, forward (to the right) or back (to the left).
 */

/** Material 3 motion curves. Emphasized-decelerate for things arriving, emphasized-accelerate for things leaving. */
export const EMPHASIZED = "cubic-bezier(.2, 0, 0, 1)";
export const DECELERATE = "cubic-bezier(.05, .7, .1, 1)";
export const ACCELERATE = "cubic-bezier(.3, 0, 1, 1)";

/** False when the device (or Settings > Accessibility > Reduce motion) asks for calm. */
export function motionOk(): boolean {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches && document.documentElement.dataset.motion !== "reduced";
}

/** How far content travels on the shared axis (Material uses 30dp). */
const TRAVEL = 30;

/** The old content slips out a little and fades. Resolves when it has gone (or at once when there is no motion). */
export function slideOut(el: HTMLElement, dir: 1 | -1 | 0): Promise<void> {
  if (!motionOk()) return Promise.resolve();
  const to: Keyframe = { opacity: 0, ...(dir ? { transform: `translateX(${-dir * TRAVEL}px)` } : {}) };
  const a = el.animate([{ opacity: 1, transform: "none" }, to], { duration: 90, easing: ACCELERATE, fill: "forwards" });
  return a.finished.then(() => { a.cancel(); }, () => { /* cancelled by a newer move */ });
}

/** The new content arrives from the side it is going to and settles. dir 0 only fades (used where a transform would move fixed children). */
export function slideIn(el: HTMLElement, dir: 1 | -1 | 0, ms = 260) {
  if (!motionOk()) return;
  const from: Keyframe = { opacity: 0, ...(dir ? { transform: `translateX(${dir * TRAVEL}px)` } : {}) };
  el.animate([from, { opacity: 1, transform: "none" }], { duration: ms, easing: DECELERATE });
}

/**
 * Slides `ref`'s content in whenever `index` changes, from the right when the index went up and from the left when it went down.
 * Not on the first render. Used for Notes / Reposts / Likes and Days / Weeks / Months.
 */
export function useSlideOnChange(ref: RefObject<HTMLElement | null>, index: number) {
  const prev = useRef(index);
  useEffect(() => {
    const was = prev.current;
    prev.current = index;
    if (was === index || !ref.current) return;
    slideIn(ref.current, index > was ? 1 : -1);
  }, [index, ref]);
}

/**
 * Keeps a highlight (an element with class "ind" inside `ref`) under the chosen tab: it measures the tab that is `[aria-selected="true"]`,
 * `.on` or `[aria-current="page"]` and publishes its box as --ind-x / --ind-y / --ind-w / --ind-h, which CSS turns into a glide.
 * The container needs `position: relative`. The first placement does not animate (data-ready is set one frame later).
 */
export function useSlidingIndicator(ref: RefObject<HTMLElement | null>, key: string | number) {
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const place = () => {
      const el = box.querySelector<HTMLElement>('[aria-selected="true"], .on, [aria-current="page"]');
      if (!el) { box.style.setProperty("--ind-o", "0"); return; }
      box.style.setProperty("--ind-x", `${el.offsetLeft}px`);
      box.style.setProperty("--ind-y", `${el.offsetTop}px`);
      box.style.setProperty("--ind-w", `${el.offsetWidth}px`);
      box.style.setProperty("--ind-h", `${el.offsetHeight}px`);
      box.style.setProperty("--ind-o", "1");
    };
    place();
    const frame = requestAnimationFrame(() => { box.dataset.ready = "1"; });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    ro?.observe(box);
    // Fonts arriving late change the width of a label.
    document.fonts?.ready.then(place).catch(() => {});
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(frame); ro?.disconnect(); window.removeEventListener("resize", place); };
  }, [ref, key]);
}
