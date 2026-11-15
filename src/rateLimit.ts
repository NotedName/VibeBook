/**
 * A brake on things a person could repeat very fast: posting, commenting, messaging, sending requests. It stops accidents
 * (a double tap, a stuck key) and slows a script that drives the page. It cannot stop someone who skips this code and calls
 * the database directly: for that there are the "rate" rules in firestore.rules (one entry every 5 seconds) and App Check
 * (see firebase.ts).
 *
 * Each action keeps the times of its recent uses in memory and in localStorage, so a page refresh does not reset the count.
 */
export const LIMITS = {
  entry: { max: 5, perMs: 60_000, label: "entries" },
  comment: { max: 10, perMs: 60_000, label: "comments" },
  message: { max: 20, perMs: 30_000, label: "messages" },
  request: { max: 20, perMs: 60_000, label: "requests" },
  report: { max: 5, perMs: 60_000, label: "reports" },
  react: { max: 30, perMs: 30_000, label: "reactions" },
} as const;

export type LimitedAction = keyof typeof LIMITS;

/** Thrown by takeTurn. Its message is written for the person, so screens can show it as it is. */
export class RateLimitError extends Error {}

const KEY = "vb.rate.";
const memory = new Map<string, number[]>();

function recent(action: string, since: number): number[] {
  let list = memory.get(action);
  if (!list) {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(KEY + action) ?? "[]");
      list = Array.isArray(parsed) ? (parsed as unknown[]).filter((t): t is number => typeof t === "number") : [];
    } catch { list = []; }
  }
  return list.filter((t) => t > since);
}

/**
 * Counts one use of `action`, or throws a message for the person when they are going too fast. Call it after the input has
 * been checked, so a mistake the person can fix does not use up a turn.
 */
export function takeTurn(action: LimitedAction): void {
  const { max, perMs, label } = LIMITS[action];
  const now = Date.now();
  const list = recent(action, now - perMs);
  if (list.length >= max) {
    const wait = Math.max(1, Math.ceil((list[0] + perMs - now) / 1000));
    throw new RateLimitError(`You're sending too many ${label} too fast. Try again in ${wait} second${wait === 1 ? "" : "s"}.`);
  }
  list.push(now);
  memory.set(action, list);
  try { localStorage.setItem(KEY + action, JSON.stringify(list)); } catch { /* private mode or full: the in-memory count still works */ }
}
