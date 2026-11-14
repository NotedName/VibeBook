import { logActivity } from "./activity";
import {
  collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { CoverId, Profile } from "./types";
import { clip } from "./text";

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
    coverPhoto: d.coverPhoto ?? "",
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
    const chars = Array.from(word); // whole characters, so an emoji is never cut in half
    for (let i = 1; i <= Math.min(chars.length, 20); i++) keys.add(chars.slice(0, i).join(""));
  }
  return [...keys];
}

export async function saveProfile(uid: string, p: Omit<Profile, "uid">): Promise<Profile> {
  const clean = {
    displayName: clip(p.displayName.trim(), NAME_MAX),
    headline: clip(p.headline.trim(), HEADLINE_MAX),
    workplace: clip(p.workplace.trim(), HEADLINE_MAX),
    bio: clip(p.bio.trim(), BIO_MAX),
    avatar: p.avatar,
    cover: p.cover,
    coverPhoto: p.coverPhoto,
  };
  await setDoc(doc(db, "profiles", uid), {
    ...clean,
    nameLower: clean.displayName.toLowerCase(),
    nameKeys: nameKeys(clean.displayName),
    updatedAt: serverTimestamp(),
  });
  const saved: Profile = { uid, ...clean };
  primeProfile(saved);
  logActivity(uid, "Updated your profile");
  return saved;
}

/** Finds people whose name starts with every word typed. */
export async function searchProfiles(text: string, selfUid: string): Promise<Profile[]> {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const main = Array.from(tokens.reduce((a, b) => (b.length > a.length ? b : a))).slice(0, 20).join("");
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
