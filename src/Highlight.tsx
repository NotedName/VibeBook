const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Text with every match of `q` marked, as in a search result. Nothing is marked when `q` is empty. */
export default function Highlight({ text, q, current = false }: { text: string; q: string; current?: boolean }) {
  const needle = q.trim();
  if (!needle) return <>{text}</>;
  // the capture group makes split() keep the matches, at the odd positions
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, "ig"));
  return <>{parts.map((part, i) => (i % 2 === 1 ? <mark key={i} className={`hl${current ? " cur" : ""}`}>{part}</mark> : part))}</>;
}
