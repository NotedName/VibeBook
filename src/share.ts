import { shareBase } from "./platform";

/** A shared post lives at #/p/<ownerUid>/<entryId>. Only Public entries can be opened this way. */
export const postLink = (ownerUid: string, entryId: string) =>
  `${shareBase()}#/p/${encodeURIComponent(ownerUid)}/${encodeURIComponent(entryId)}`;

export function parsePostHash(hash: string): { uid: string; id: string } | null {
  const m = hash.match(/^#\/p\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  try { return { uid: decodeURIComponent(m[1]), id: decodeURIComponent(m[2]) }; } catch { return null; }
}
