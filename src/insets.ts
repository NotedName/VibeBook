import { isNativeApp } from "./platform";

/** Used when the Android WebView draws under the status bar but reports no safe area. Roughly the tallest common status bar. */
const FALLBACK_TOP_PX = 40;

/**
 * In the Android app the page can be drawn under the status bar (edge to edge). Normally the browser then reports the bar's height as
 * env(safe-area-inset-top) and the CSS keeps the top bar clear of it. Some WebViews report 0, which leaves the Back button and the
 * top bar underneath the clock and notification icons. When that happens, --safe-top (see styles.css) is raised to a fixed height.
 * A WebView that does report the real value is left alone, so this does nothing in a browser or on a correct device.
 */
function apply() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top, 0px)";
  document.body.appendChild(probe);
  const reported = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  const root = document.documentElement.style;
  if (reported < 1) root.setProperty("--safe-top", `${FALLBACK_TOP_PX}px`);
  else root.removeProperty("--safe-top");
}

export function watchInsets() {
  if (!isNativeApp) return;
  apply();
  // the value can arrive a moment after start-up, or change when the phone is turned or a foldable opens
  setTimeout(apply, 600);
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
}
