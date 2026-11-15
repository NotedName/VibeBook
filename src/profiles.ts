import { logActivity } from "./activity";
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { isAudience, type Audience, type CoverId, type Profile } from "./types";
import { clip } from "./text";
import { syncSchedule } from "./hours";

export const NAME_MAX = 60;
export const HEADLINE_MAX = 80;
export const BIO_MAX = 300;

// ---- Usernames -------------------------------------------------------------------------------
// A username is the person's unique identifier and the last part of their profile link
// (#/u/<username>). Uniqueness is enforced by usernames/{username}: one document per name whose id
// IS the name, so two people can never hold the same one. firestore.rules allows creating that
// document only when it does not exist yet.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[a-z0-9_]+$/;
/** Names that would read like part of the app itself. */
const RESERVED = new Set(["me", "admin", "vibebook", "support", "help", "feed", "people", "groups", "logbook", "settings", "account", "u", "g", "p"]);

export class UsernameTakenError extends Error {
  constructor() { super("That username is already taken. Try another one."); }
}

/** "  @Juan_DC " -> "juan_dc". Usernames are case-insensitive and always stored lowercase. */
export const normalizeUsername = (raw: string): string => raw.trim().replace(/^@/, "").toLowerCase();

/** Why a username cannot be used, or "" when it is fine. Availability is checked separately. */
export function usernameProblem(raw: string): string {
  const u = normalizeUsername(raw);
  if (u.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`;
  if (u.length > USERNAME_MAX) return `Use at most ${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(u)) return "Use only letters, numbers and underscores.";
  if (RESERVED.has(u)) return "That username is reserved. Try another one.";
  return "";
}

/** A starting point taken from someone's name, e.g. "Juan Dela Cruz" -> "juandelacruz". */
export function suggestUsername(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, USERNAME_MAX);
}

/** True when nobody else holds the username. Works signed out, so it can run on the sign-up form. */
export async function isUsernameAvailable(raw: string, selfUid?: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "usernames", normalizeUsername(raw)));
  return !snap.exists() || (selfUid !== undefined && snap.data().uid === selfUid);
}

// The name typed at sign-up is only remembered on this device. It is reserved for real once the email is
// verified and the profile is saved, so unverified accounts can never hold names.
const pendingKey = (uid: string) => `vibebook.pendingUsername.${uid}`;
export function rememberPendingUsername(uid: string, raw: string) {
  try { localStorage.setItem(pendingKey(uid), normalizeUsername(raw)); } catch { /* private mode: they will pick again */ }
}
export function pendingUsername(uid: string): string {
  try { return localStorage.getItem(pendingKey(uid)) ?? ""; } catch { return ""; }
}
function clearPendingUsername(uid: string) {
  try { localStorage.removeItem(pendingKey(uid)); } catch { /* nothing to clear */ }
}

/** The username this person already holds, if any. */
export async function fetchMyUsername(uid: string): Promise<string> {
  const snap = await getDocs(query(collection(db, "usernames"), where("uid", "==", uid), limit(1)));
  return snap.docs[0]?.id ?? "";
}

/** Link to someone's profile: by username when they have one, by uid for older accounts. */
export const personHash = (uid: string, p?: { username?: string } | null): string =>
  `#/u/${encodeURIComponent(p?.username || uid)}`;

const refCache = new Map<string, Promise<string | null>>();

/** Turns what is after #/u/ (a username, or a uid from an older link) into a uid. null = no such person. */
export function resolveUserRef(ref: string): Promise<string | null> {
  let p = refCache.get(ref);
  if (!p) {
    const name = normalizeUsername(ref);
    p = (async () => {
      if (name.length >= USERNAME_MIN && name.length <= USERNAME_MAX && USERNAME_RE.test(name)) {
        const snap = await getDoc(doc(db, "usernames", name));
        if (snap.exists()) return snap.data().uid as string;
      }
      return /^[A-Za-z0-9]{20,}$/.test(ref) ? ref : null; // links made before usernames carry the uid
    })();
    p.catch(() => refCache.delete(ref));
    refCache.set(ref, p);
  }
  return p;
}

type Stored = Partial<Omit<Profile, "uid">> & { friendsVisible?: boolean; hoursVisible?: boolean };

function toProfile(uid: string, d: Stored): Profile {
  return {
    uid,
    displayName: d.displayName ?? "",
    username: d.username ?? "",
    headline: d.headline ?? "",
    workplace: d.workplace ?? "",
    bio: d.bio ?? "",
    avatar: d.avatar ?? "",
    cover: (d.cover as CoverId) ?? "amethyst",
    coverPhoto: d.coverPhoto ?? "",
    // Profiles saved before audiences existed hold friendsVisible / hoursVisible booleans; they map to the same reach.
    friendsAudience: isAudience(d.friendsAudience) ? d.friendsAudience : d.friendsVisible === false ? "private" : "everyone",
    hoursAudience: isAudience(d.hoursAudience) ? d.hoursAudience : d.hoursVisible === true ? "everyone" : "private",
    scheduleAudience: isAudience(d.scheduleAudience) ? d.scheduleAudience : "private",
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
    username: normalizeUsername(p.username ?? ""),
    headline: clip(p.headline.trim(), HEADLINE_MAX),
    workplace: clip(p.workplace.trim(), HEADLINE_MAX),
    bio: clip(p.bio.trim(), BIO_MAX),
    avatar: p.avatar,
    cover: p.cover,
    coverPhoto: p.coverPhoto,
    friendsAudience: p.friendsAudience,
    hoursAudience: p.hoursAudience,
    scheduleAudience: p.scheduleAudience,
  };
  if (clean.username) {
    const problem = usernameProblem(clean.username);
    if (problem) throw new Error(problem);
  }
  const profileRef = doc(db, "profiles", uid);
  // One transaction: the username is claimed (or swapped for a new one) and the profile saved together,
  // so a name can never end up on two profiles, and a profile never points at a name it does not own.
  await runTransaction(db, async (tx) => {
    const profileSnap = await tx.get(profileRef);
    const previous = profileSnap.exists() ? normalizeUsername(String(profileSnap.data().username ?? "")) : "";
    const claimRef = clean.username ? doc(db, "usernames", clean.username) : null;
    const claim = claimRef ? await tx.get(claimRef) : null;
    if (claim?.exists() && claim.data().uid !== uid) throw new UsernameTakenError();
    const oldRef = previous && previous !== clean.username ? doc(db, "usernames", previous) : null;
    const old = oldRef ? await tx.get(oldRef) : null;

    if (claimRef && claim && !claim.exists()) tx.set(claimRef, { uid, createdAt: serverTimestamp() });
    if (oldRef && old?.exists() && old.data().uid === uid) tx.delete(oldRef); // frees the old name for others
    tx.set(profileRef, {
      ...clean,
      nameLower: clean.displayName.toLowerCase(),
      nameKeys: nameKeys(`${clean.displayName} ${clean.username}`),
      updatedAt: serverTimestamp(),
    });
  });
  clearPendingUsername(uid);
  refCache.clear(); // a changed username means old links no longer point here
  const saved: Profile = { uid, ...clean };
  primeProfile(saved);
  logActivity(uid, "Updated your profile");
  return saved;
}

type AudienceField = "friendsAudience" | "hoursAudience" | "scheduleAudience";

async function saveAudience(uid: string, field: AudienceField, audience: Audience): Promise<void> {
  await updateDoc(doc(db, "profiles", uid), { [field]: audience });
  const cached = await fetchProfile(uid).catch(() => null);
  if (cached) primeProfile({ ...cached, [field]: audience });
}

const AUDIENCE_WORDS: Record<Audience, string> = { private: "only you", friends: "your friends", fof: "friends of your friends", everyone: "everyone" };

/** Settings > Privacy: who can open your friends list. */
export async function setFriendsAudience(uid: string, audience: Audience): Promise<void> {
  await saveAudience(uid, "friendsAudience", audience);
  logActivity(uid, `Showed your friends list to ${AUDIENCE_WORDS[audience]}`);
}

/**
 * Settings > Privacy: who can see how many hours you have logged (and of how many required). Only me by default.
 * Choosing only me also deletes the shared summary (users/{uid}/hours/shared), so nothing is left to read.
 */
export async function setHoursAudience(uid: string, audience: Audience): Promise<void> {
  await saveAudience(uid, "hoursAudience", audience);
  if (audience === "private") await deleteDoc(doc(db, "users", uid, "hours", "shared"));
  logActivity(uid, `Showed your hours to ${AUDIENCE_WORDS[audience]}`);
}

/** Settings > Privacy: who can see which days you work and how long. Choosing anyone publishes your saved days; only me deletes them. */
export async function setScheduleAudience(uid: string, audience: Audience): Promise<void> {
  await saveAudience(uid, "scheduleAudience", audience);
  await syncSchedule(uid, audience !== "private");
  logActivity(uid, `Showed your schedule to ${AUDIENCE_WORDS[audience]}`);
}

/** Finds people whose name or username starts with every word typed ("@" in front is ignored). */
export async function searchProfiles(text: string, selfUid: string): Promise<Profile[]> {
  const tokens = text.toLowerCase().split(/\s+/).map((t) => t.replace(/^@/, "")).filter(Boolean);
  if (!tokens.length) return [];
  const main = Array.from(tokens.reduce((a, b) => (b.length > a.length ? b : a))).slice(0, 20).join("");
  const snap = await getDocs(query(collection(db, "profiles"), where("nameKeys", "array-contains", main), limit(30)));
  const out: Profile[] = [];
  snap.docs.forEach((d) => {
    if (d.id === selfUid) return;
    const p = toProfile(d.id, d.data() as Stored);
    const words = [...p.displayName.toLowerCase().split(/\s+/), p.username];
    if (tokens.every((t) => words.some((w) => w.startsWith(t)))) { primeProfile(p); out.push(p); }
  });
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
