import { useEffect, type RefObject } from "react";

/**
 * While a messaging screen is open, the page itself does not scroll: the list of messages (or chats) scrolls inside its own frame.
 * Pass the conversation's element to have it follow the visible part of the screen, so the message box stays above a phone keyboard
 * (it sets --vvh and --vvtop on it, which layout.css uses on phones and tablets).
 */
export function useMessagingFrame(follow?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("msg-lock");
    return () => root.classList.remove("msg-lock");
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    const el = follow?.current;
    if (!vv || !el) return;
    const apply = () => {
      if (vv.scale > 1.01) { el.style.removeProperty("--vvh"); el.style.removeProperty("--vvtop"); return; } // pinch-zoomed: leave it alone
      el.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      el.style.setProperty("--vvtop", `${Math.round(vv.offsetTop)}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      el.style.removeProperty("--vvh");
      el.style.removeProperty("--vvtop");
    };
  }, [follow]);
}
