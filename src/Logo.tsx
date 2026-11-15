import type { CSSProperties } from "react";

// Each stroke is normalised to length 1 (pathLength) and given an order (--i), so hovering the logo can draw it stroke by stroke (see fluid.css).
const st = (i: number) => ({ "--i": i }) as CSSProperties;

/** VibeBook mark: an open book with lines of text on both pages and three coloured rays rising from its spine. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path pathLength={1} style={st(0)} d="M32 16C26 12 16 12 7 14v34c9-2 19-1 25 3" />
      <path pathLength={1} style={st(0)} d="M32 16c6-4 16-4 25-2v34c-9-2-19-1-25 3" />
      <path pathLength={1} style={st(1)} d="M32 16v35" />
      <path pathLength={1} style={st(2)} d="M7 54c9-2 18-1 25 3 7-4 16-5 25-3" />
      <path pathLength={1} style={st(3)} d="M13 25h13M13 31h13M13 37h8" />
      <path pathLength={1} style={st(3)} d="M38 25h13M38 31h13M38 37h8" />
      <path pathLength={1} style={st(4)} d="M18.5 9l3.5 5" stroke="#b23cff" />
      <path pathLength={1} style={st(5)} d="M32 4.5v6" stroke="#ff6aa8" />
      <path pathLength={1} style={st(6)} d="M45.5 9L42 14" stroke="#ffa15a" />
    </svg>
  );
}

/** Logo mark plus the two-tone wordmark, for use inside an element with the "brand" class. */
export function BrandName() {
  return (
    <>
      <LogoMark className="brand-mark" />
      <span className="brand-word"><span>Vibe</span>Book</span>
    </>
  );
}
