import { useRef, useState, type DragEvent } from "react";

/** True while the thing being dragged is made of files (not selected text or a link inside the page). */
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/**
 * Lets pictures be dragged onto an element. Spread `bind` on the element, show `<DropHint />` while `over` is true, and
 * `onImages` gets the dropped pictures (anything that is not a picture is ignored; `onRejected` hears about files that were
 * all something else). Dragging only starts on a computer with a mouse, so on a phone nothing changes.
 */
export function useImageDrop(onImages: (files: File[]) => void, opts: { disabled?: boolean; onRejected?: () => void } = {}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0); // dragenter and dragleave fire for every child, so count them
  const off = !!opts.disabled;
  const bind = {
    onDragEnter(e: DragEvent) {
      if (off || !hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    onDragOver(e: DragEvent) {
      if (off || !hasFiles(e)) return;
      e.preventDefault(); // without this the browser refuses the drop
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(e: DragEvent) {
      if (off || !hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop(e: DragEvent) {
      if (off || !hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const all = Array.from(e.dataTransfer.files);
      const pics = all.filter((f) => f.type.startsWith("image/"));
      if (pics.length) onImages(pics);
      else if (all.length) opts.onRejected?.();
    },
  };
  return { over: over && !off, bind };
}

/** The dashed frame shown over a drop zone while a file is dragged across it. The zone must be positioned (see .drop-zone). */
export function DropHint({ label = "Drop photos to add" }: { label?: string }) {
  return <div className="drop-hint" aria-hidden="true"><span>{label}</span></div>;
}
