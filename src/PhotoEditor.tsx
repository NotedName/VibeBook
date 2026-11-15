import { BlockSkeleton } from "./Skeleton";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, FlipIcon, RotateIcon } from "./icons";
import { useScrollLock } from "./scrollLock";

type Aspect = "original" | "1:1" | "4:3" | "16:9";
const ASPECTS: { id: Aspect; label: string; ratio: number | null }[] = [
  { id: "original", label: "Original", ratio: null },
  { id: "1:1", label: "Square", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
];

const WORK_SIDE = 1600; // longest side of the working copy
const OUT_SIDE = 1280; // longest side of the saved photo
const PREVIEW_SIDE = 640;

type Look = { brightness: number; contrast: number; saturation: number }; // percent, 100 = unchanged
const NEUTRAL: Look = { brightness: 100, contrast: 100, saturation: 100 };

/** Draws the photo turned and flipped onto a working canvas, scaled down to WORK_SIDE. */
function orient(bitmap: ImageBitmap, turns: number, flip: boolean): HTMLCanvasElement {
  const swap = turns % 2 === 1;
  const w = swap ? bitmap.height : bitmap.width;
  const h = swap ? bitmap.width : bitmap.height;
  const s = Math.min(1, WORK_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.scale(flip ? -1 : 1, 1);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.scale(s, s);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return c;
}

function frameSize(ratio: number, side: number): [number, number] {
  return ratio >= 1 ? [side, Math.round(side / ratio)] : [Math.round(side * ratio), side];
}

/** How much larger than the frame the photo is, as a fraction of the frame, on each axis. */
function overflow(src: HTMLCanvasElement, ratio: number, zoom: number): [number, number] {
  const ar = src.width / src.height;
  return [Math.max(1, ar / ratio) * zoom, Math.max(1, ratio / ar) * zoom];
}

function adjust(img: ImageData, { brightness, contrast, saturation }: Look) {
  const d = img.data;
  const b = brightness / 100, c = contrast / 100, s = saturation / 100;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = ((gray + (d[i] - gray) * s) * b - 128) * c + 128;
    d[i + 1] = ((gray + (d[i + 1] - gray) * s) * b - 128) * c + 128;
    d[i + 2] = ((gray + (d[i + 2] - gray) * s) * b - 128) * c + 128;
  }
}

type Pan = { x: number; y: number }; // -1..1 across the room the photo has to move

function render(canvas: HTMLCanvasElement, src: HTMLCanvasElement, ratio: number, zoom: number, pan: Pan, look: Look, side: number) {
  const [fw, fh] = frameSize(ratio, side);
  canvas.width = fw;
  canvas.height = fh;
  const scale = Math.max(fw / src.width, fh / src.height) * zoom;
  const dw = src.width * scale, dh = src.height * scale;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, (fw - dw) / 2 + (pan.x * (dw - fw)) / 2, (fh - dh) / 2 + (pan.y * (dh - fh)) / 2, dw, dh);
  if (look.brightness !== 100 || look.contrast !== 100 || look.saturation !== 100) {
    const img = ctx.getImageData(0, 0, fw, fh);
    adjust(img, look);
    ctx.putImageData(img, 0, 0);
  }
}

type Props = {
  file: File;
  onApply: (edited: File) => void;
  onCancel: () => void;
  /** Lock the frame to this width / height (1 for a profile photo, 3 for a cover). The shape choices are hidden. */
  fixedRatio?: number;
  /** Longest side of the saved image in pixels when the frame is locked. */
  outSide?: number;
  title?: string;
};

/** Crop, rotate, flip and adjust a photo before it is attached to an entry. */
export default function PhotoEditor({ file, onApply, onCancel, fixedRatio, outSide, title = "Edit photo" }: Props) {
  useScrollLock();
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [turns, setTurns] = useState(0);
  const [flip, setFlip] = useState(false);
  const [aspect, setAspect] = useState<Aspect>("original");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [look, setLook] = useState<Look>(NEUTRAL);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let live = true;
    let made: ImageBitmap | null = null;
    createImageBitmap(file, { imageOrientation: "from-image" }).then(
      (b) => { made = b; if (live) setBitmap(b); else b.close(); },
      () => live && setLoadError(true),
    );
    return () => { live = false; made?.close(); };
  }, [file]);

  // Escape closes only this editor, not the entry sheet underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const oriented = useMemo(() => (bitmap ? orient(bitmap, turns, flip) : null), [bitmap, turns, flip]);
  const ratio = fixedRatio ?? (oriented ? ASPECTS.find((a) => a.id === aspect)!.ratio ?? oriented.width / oriented.height : 1);

  useEffect(() => {
    if (oriented && canvasRef.current) render(canvasRef.current, oriented, ratio, zoom, pan, look, PREVIEW_SIDE);
  }, [oriented, ratio, zoom, pan, look]);

  function turn(by: number) { setTurns((t) => (t + by + 4) % 4); setPan({ x: 0, y: 0 }); }
  function pickAspect(a: Aspect) { setAspect(a); setPan({ x: 0, y: 0 }); }
  function reset() {
    setTurns(0); setFlip(false); setAspect("original"); setZoom(1); setPan({ x: 0, y: 0 }); setLook(NEUTRAL);
  }

  function onDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drag.current || !oriented) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const [ox, oy] = overflow(oriented, ratio, zoom);
    const dx = (e.clientX - drag.current.x) / rect.width;
    const dy = (e.clientY - drag.current.y) / rect.height;
    drag.current = { x: e.clientX, y: e.clientY };
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    setPan((p) => ({
      x: ox > 1 ? clamp(p.x + dx / ((ox - 1) / 2)) : 0,
      y: oy > 1 ? clamp(p.y + dy / ((oy - 1) / 2)) : 0,
    }));
  }

  function apply() {
    if (!oriented) return;
    setBusy(true);
    const out = document.createElement("canvas");
    render(out, oriented, ratio, zoom, pan, look, fixedRatio ? outSide ?? OUT_SIDE : Math.min(OUT_SIDE, Math.max(oriented.width, oriented.height)));
    out.toBlob((blob) => {
      if (!blob) { setBusy(false); return; }
      onApply(new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  /** A slider that fills from its neutral point (where "reset" lands) to the thumb, with the value beside the name. */
  const slider = (
    label: string, value: number, min: number, max: number, step: number, neutral: number,
    set: (v: number) => void, show: (v: number) => string,
  ) => {
    const at = (v: number) => ((v - min) / (max - min)) * 100;
    const [lo, hi] = [Math.min(at(value), at(neutral)), Math.max(at(value), at(neutral))];
    return (
      <div className="slider">
        <div className="slider-head">
          <span>{label}</span>
          <button type="button" className="slider-value" disabled={value === neutral} onClick={() => set(neutral)}
            title={value === neutral ? undefined : `Reset ${label.toLowerCase()}`}
            aria-label={value === neutral ? `${label} ${show(value)}` : `${label} ${show(value)}, reset`}>{show(value)}</button>
        </div>
        <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
          style={{ "--lo": `${lo}%`, "--hi": `${hi}%` } as CSSProperties}
          onChange={(e) => set(Number(e.target.value))} />
      </div>
    );
  };
  const signed = (v: number) => (v === 100 ? "0" : v > 100 ? `+${v - 100}` : `\u2212${100 - v}`);

  return createPortal(
    <div className="overlay editor">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onCancel}><CloseIcon /></button>
        </div>

        <div className="sheet-body">
          {loadError && <p className="error" role="alert">That photo could not be opened.</p>}
          {!loadError && !oriented && <BlockSkeleton label="Loading photo" />}
          <canvas ref={canvasRef} className={`editor-canvas${fixedRatio === 1 ? " round" : ""}`} hidden={!oriented}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)} />
          {oriented && <p className="hint">Drag the photo to move it inside the frame.</p>}

          {!fixedRatio && <div className="seg four">
            {ASPECTS.map((a) => (
              <label key={a.id} className={aspect === a.id ? "on" : ""}>
                <input type="radio" name="aspect" checked={aspect === a.id} onChange={() => pickAspect(a.id)} />
                {a.label}
              </label>
            ))}
          </div>}

          <div className="editor-tools">
            <button type="button" className="btn turn-left" onClick={() => turn(-1)}><RotateIcon />Left</button>
            <button type="button" className="btn" onClick={() => turn(1)}><RotateIcon />Right</button>
            <button type="button" className="btn" onClick={() => { setFlip(!flip); setPan({ x: 0, y: 0 }); }}><FlipIcon />Flip</button>
            <button type="button" className="btn" onClick={reset}>Reset</button>
          </div>

          <div className="sliders">
            {slider("Zoom", zoom, 1, 3, 0.05, 1, setZoom, (v) => `${v.toFixed(2).replace(/0$/, "")}\u00d7`)}
            {slider("Brightness", look.brightness, 50, 150, 1, 100, (v) => setLook({ ...look, brightness: v }), signed)}
            {slider("Contrast", look.contrast, 50, 150, 1, 100, (v) => setLook({ ...look, contrast: v }), signed)}
            {slider("Saturation", look.saturation, 0, 200, 1, 100, (v) => setLook({ ...look, saturation: v }), signed)}
          </div>
        </div>

        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn primary" disabled={!oriented || busy} onClick={apply}>{busy ? "Applying…" : "Use photo"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
