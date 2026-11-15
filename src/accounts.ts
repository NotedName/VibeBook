import { useSyncExternalStore } from "react";

/**
 * The accounts that have signed in on this device, for the account menu and the sign-in screen. Only a name and an email address are kept
 * (never a password): picking one fills in the email address, and the password is asked for as usual. Saved on this device only.
 */
export type KnownAccount = { uid: string; email: string; name: string };

const KEY = "vibebook-accounts";
const HINT_KEY = "vibebook-login-hint";
const MAX = 5;

function load(): KnownAccount[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((a): a is KnownAccount => !!a && typeof a.uid === "string" && typeof a.email === "string" && typeof a.name === "string").slice(0, MAX);
  } catch { return []; }
}

let state = load();
const listeners = new Set<() => void>();

function save(next: KnownAccount[]) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

/** Adds or refreshes an account, newest first. Does nothing when nothing changed. */
export function rememberAccount(a: KnownAccount) {
  const first = state[0];
  if (first && first.uid === a.uid && first.email === a.email && first.name === a.name) return;
  save([a, ...state.filter((x) => x.uid !== a.uid)].slice(0, MAX));
}

export const forgetAccount = (uid: string) => save(state.filter((a) => a.uid !== uid));

/** The sign-in screen starts with this email address filled in (set before signing out to switch accounts). */
export function setLoginHint(email: string) {
  try { if (email) localStorage.setItem(HINT_KEY, email); else localStorage.removeItem(HINT_KEY); } catch { /* private mode */ }
}
export function peekLoginHint(): string {
  try { return localStorage.getItem(HINT_KEY) ?? ""; } catch { return ""; }
}
export const clearLoginHint = () => setLoginHint("");

export function useKnownAccounts(): KnownAccount[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state);
}
