import { useEffect } from "react";
import { useScrollLock } from "./scrollLock";
import ZoomImage from "./ZoomImage";
import { CloseIcon } from "./icons";

/** Full-screen, zoomable view of one picture (a profile photo, a cover photo, a group picture). Tap outside, press Escape or Close to leave. */
export default function ImageViewer({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay lightbox" role="dialog" aria-modal="true" aria-label={label}>
      <ZoomImage src={src} alt={label} onBackdrop={onClose} />
      <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
    </div>
  );
}
