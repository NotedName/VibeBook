/**
 * The splash screen (the animated VibeBook mark and name) is plain HTML in index.html, outside React,
 * so it is on screen before the app bundle has even downloaded. The app calls hideSplash() once it has
 * something real to show; the splash then fades away.
 */
const MIN_MS = 1500;  // let the intro animation play through once, even on a fast load
const MAX_MS = 8000;  // never trap someone behind it if a request hangs

let hiding = false;

export function hideSplash(): void {
  if (hiding) return;
  hiding = true;
  const el = document.getElementById("splash");
  if (!el) return;
  // performance.now() counts from when the page started loading, so a slow load adds no extra wait.
  const wait = Math.max(0, MIN_MS - performance.now());
  window.setTimeout(() => {
    el.classList.add("out");
    el.setAttribute("aria-hidden", "true");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    window.setTimeout(() => el.remove(), 1000); // fallback when no transition runs (e.g. a background tab)
  }, wait);
}

window.setTimeout(hideSplash, MAX_MS);
