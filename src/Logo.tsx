/** VibeBook mark: a book opening, with a little light rising from its pages. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs>
        <linearGradient id="vb-swoosh" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#b23cff" />
          <stop offset=".6" stopColor="#ff6aa8" />
          <stop offset="1" stopColor="#ffa15a" />
        </linearGradient>
      </defs>
      <path d="M32 18C26 14 16 13 8 15v34c8-2 18-1 24 3" />
      <path d="M32 18c6-4 16-5 24-3v34c-8-2-18-1-24 3" />
      <path d="M32 18v34" />
      <path d="M7 54c9-2 18-1 25 3 7-4 16-5 25-3" />
      <path d="M14 24h12M14 30h12M14 36h8M38 24h12M38 30h12M38 36h8" />
      <path d="M32 11V5M22 13l-3-5M42 13l3-5" stroke="url(#vb-swoosh)" />
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
