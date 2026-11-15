// Parallax for the honeycomb background: the pattern drifts at a fraction of the scroll speed, so it feels like it sits behind the
// page. The offset wraps every 100px (one hexagon tile), so it never runs out and needs no extra layout. Only a CSS variable is
// written, once per frame, and the layer is moved by the compositor. Skipped for people who ask for reduced motion, on the device or in Settings > Accessibility (data-motion on <html>).
const TILE = 100; // default: one tile of the classic honeycomb; other styles say theirs in --honey-h
const SPEED = 0.18;

export function watchParallax() {
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let queued = false;
  const update = () => {
    queued = false;
    if (reduce.matches || root.dataset.motion === "reduced") { root.style.removeProperty("--parallax-y"); return; }
    const y = window.scrollY || 0;
    const tile = parseFloat(getComputedStyle(root).getPropertyValue("--honey-h")) || TILE;
    root.style.setProperty("--parallax-y", `${-((y * SPEED) % tile)}px`);
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener("scroll", onScroll, { passive: true });
  reduce.addEventListener?.("change", update);
  new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ["data-motion", "data-honey"] });
  update();
}
