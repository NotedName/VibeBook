/** Line-art VibeBook mark: an open book with notes, a check, a photo and a vibe swoosh. */
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
      <path d="M32 15C25 11 15 11 7 13v38c8-2 18-2 25 2 7-4 17-4 25-2V13c-8-2-18-2-25 2z" />
      <path d="M32 15v38" />
      <path d="M14 21h11M14 27h11M14 33h7" />
      <path d="M40 24l4 4 8-9" />
      <rect x="13" y="39" width="12" height="8" rx="2" />
      <circle cx="19" cy="43" r="2" />
      <path d="M30 46c8-8 18-8 30-20" stroke="url(#vb-swoosh)" />
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
