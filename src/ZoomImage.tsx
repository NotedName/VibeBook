import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { MinusIcon, PlusIcon } from "./icons";

const MIN = 1;
const MAX = 6;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type Props = {
  src: string;
  alt: string;
  /** Tells the viewer when the picture is zoomed in, so it can stop swiping to the next photo. */
  onZoomed?: (zoomed: boolean) => void;
  /** Tapping the empty space around an unzoomed picture. */
  onBackdrop?: () => void;
};

/**
 * A picture you can zoom: mouse wheel, pinch, double-tap or double-click, the + / − buttons, or the + − 0 keys.
 * Zoomed in, drag to move around. Starts fitted to the screen each time the picture changes.
 */
export default function ZoomImage({ src, alt, onZoomed, onBackdrop }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const live = useRef(view);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; s: number } | null>(null);
  const lastTap = useRef(0);
  const moved = useRef(false);

  const apply = useCallback((next: { s: number; x: number; y: number }) => {
    const b = box.current, i = img.current;
    const s = clamp(next.s, MIN, MAX);
    // Keep the picture from being dragged out of view.
    const maxX = b && i ? Math.max(0, (i.clientWidth * s - b.clientWidth) / 2) : 0;
    const maxY = b && i ? Math.max(0, (i.clientHeight * s - b.clientHeight) / 2) : 0;
    const v = s === 1 ? { s, x: 0, y: 0 } : { s, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
    live.current = v;
    setView(v);
  }, []);

  /** Zoom to scale `s` keeping the point under (cx, cy), measured from the centre of the box, where it is. */
  const zoomAt = useCallback((s: number, cx: number, cy: number) => {
    const { s: s0, x, y } = live.current;
    const s1 = clamp(s, MIN, MAX);
    const k = s1 / s0;
    apply({ s: s1, x: cx - (cx - x) * k, y: cy - (cy - y) * k });
  }, [apply]);

  const fromCentre = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    return { cx: clientX - (r.left + r.width / 2), cy: clientY - (r.top + r.height / 2) };
  };

  useEffect(() => { apply({ s: 1, x: 0, y: 0 }); }, [src, apply]);
  useEffect(() => { onZoomed?.(view.s > 1); }, [view.s, onZoomed]);

  // Wheel needs a non-passive listener so the page does not scroll as well.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { cx, cy } = fromCentre(e.clientX, e.clientY);
      zoomAt(live.current.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), cx, cy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "+" || e.key === "=") zoomAt(live.current.s * 1.5, 0, 0);
      else if (e.key === "-" || e.key === "_") zoomAt(live.current.s / 1.5, 0, 0);
      else if (e.key === "0") apply({ s: 1, x: 0, y: 0 });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoomAt, apply]);

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function onPointerDown(e: RPointerEvent) {
    box.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (pointers.current.size === 2) pinch.current = { dist: dist(), s: live.current.s };
  }
  function onPointerMove(e: RPointerEvent) {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const { cx, cy } = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomAt(pinch.current.s * (dist() / pinch.current.dist), cx, cy);
      moved.current = true;
    } else if (pointers.current.size === 1 && live.current.s > 1) {
      if (Math.abs(dx) + Math.abs(dy) > 0) moved.current = true;
      apply({ ...live.current, x: live.current.x + dx, y: live.current.y + dy });
    }
  }
  function onPointerUp(e: RPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (e.pointerType === "touch" && !moved.current && pointers.current.size === 0) {
      const now = Date.now();
      if (now - lastTap.current < 300) { toggle(e.clientX, e.clientY); lastTap.current = 0; } else lastTap.current = now;
    }
  }
  function toggle(clientX: number, clientY: number) {
    const { cx, cy } = fromCentre(clientX, clientY);
    if (live.current.s > 1) apply({ s: 1, x: 0, y: 0 });
    else zoomAt(2.5, cx, cy);
  }

  return (
    <div ref={box} className={`zoom-box${view.s > 1 ? " zoomed" : ""}`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={(e) => toggle(e.clientX, e.clientY)}
      onClick={(e) => { if (e.target === e.currentTarget && view.s === 1) onBackdrop?.(); }}>
      <img ref={img} src={src} alt={alt} draggable={false}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }} />
      <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn" aria-label="Zoom out" disabled={view.s <= MIN} onClick={() => zoomAt(view.s / 1.5, 0, 0)}><MinusIcon /></button>
        <button type="button" className="zoom-level" aria-label="Reset zoom" disabled={view.s === 1} onClick={() => apply({ s: 1, x: 0, y: 0 })}>{Math.round(view.s * 100)}%</button>
        <button type="button" className="icon-btn" aria-label="Zoom in" disabled={view.s >= MAX} onClick={() => zoomAt(view.s * 1.5, 0, 0)}><PlusIcon /></button>
      </div>
    </div>
  );
}
