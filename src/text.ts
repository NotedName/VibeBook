/** Text helpers that keep emoji whole. An emoji can be two UTF-16 units, and cutting between them leaves a broken character. */

/** First visible character, so a name that starts with an emoji gives the emoji, not half of it. */
export const firstChar = (text: string): string => Array.from(text.trim())[0] ?? "";

/** Cuts to at most `max` UTF-16 units without splitting an emoji in two. */
export function clip(text: string, max: number): string {
  const cut = text.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) && cut.length < text.length ? cut.slice(0, -1) : cut;
}
