import {
  collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { CoverId, Profile } from "./types";

export const NAME_MAX = 60;
export const HEADLINE_MAX = 80;
export const BIO_MAX = 300;

type Stored = Partial<Omit<Profile, "uid">>;

function toProfile(uid: string, d: Stored): Profile {
  return {
    uid,
    displayName: d.displayName ?? "",
    headline: d.headline ?? "",
    workplace: d.workplace ?? "",
    bio: d.bio ?? "",
    avatar: d.avatar ?? "",
    cover: (d.cover as CoverId) ?? "amethyst",
  };
}
export { toProfile };

const cache = new Map<string, Promise<Profile | null>>();

export function fetchProfile(uid: string): Promise<Profile | null> {
  let p = cache.get(uid);
  if (!p) {
    p = getDoc(doc(db, "profiles", uid)).then((s) => (s.exists() ? toProfile(uid, s.data() as Stored) : null));
    p.catch(() => cache.delete(uid));
    cache.set(uid, p);
  }
  return p;
}
export function primeProfile(p: Profile) { cache.set(p.uid, Promise.resolve(p)); }

/** Lowercase prefixes of every word in a name, so "pau" or "tal" finds "Paul Talusig". */
export function nameKeys(name: string): string[] {
  const keys = new Set<string>();
  for (const word of name.toLowerCase().split(/\s+/).filter(Boolean)) {
    for (let i = 1; i <= Math.min(word.length, 20); i++) keys.add(word.slice(0, i));
  }
  return [...keys];
}

export async function saveProfile(uid: string, p: Omit<Profile, "uid">): Promise<Profile> {
  const clean = {
    displayName: p.displayName.trim().slice(0, NAME_MAX),
    headline: p.headline.trim().slice(0, HEADLINE_MAX),
    workplace: p.workplace.trim().slice(0, HEADLINE_MAX),
    bio: p.bio.trim().slice(0, BIO_MAX),
    avatar: p.avatar,
    cover: p.cover,
  };
  await setDoc(doc(db, "profiles", uid), {
    ...clean,
    nameLower: clean.displayName.toLowerCase(),
    nameKeys: nameKeys(clean.displayName),
    updatedAt: serverTimestamp(),
  });
  const saved: Profile = { uid, ...clean };
  primeProfile(saved);
  return saved;
}

/** Finds people whose name starts with every word typed. */
export async function searchProfiles(text: string, selfUid: string): Promise<Profile[]> {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const main = tokens.reduce((a, b) => (b.length > a.length ? b : a)).slice(0, 20);
  const snap = await getDocs(query(collection(db, "profiles"), where("nameKeys", "array-contains", main), limit(30)));
  const out: Profile[] = [];
  snap.docs.forEach((d) => {
    if (d.id === selfUid) return;
    const p = toProfile(d.id, d.data() as Stored);
    const words = p.displayName.toLowerCase().split(/\s+/);
    if (tokens.every((t) => words.some((w) => w.startsWith(t)))) { primeProfile(p); out.push(p); }
  });
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
