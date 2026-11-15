import { useLayoutEffect, useRef, useState } from "react";
import { Linkified } from "./links";

/** A paragraph that shows only its first few lines when it is long, with a Show more / Show less button. */
export default function ClampedText({ text, lines = 6, className = "" }: { text: string; lines?: number; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);

  // Measured while clamped: more text than fits means there is something to show.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [text, lines, open]);

  return (
    <div className="clamped">
      <p ref={ref} className={`${className}${open ? "" : " is-clamped"}`} style={open ? undefined : { WebkitLineClamp: lines }}><Linkified text={text} /></p>
      {(clipped || open) && (
        <button type="button" className="show-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
