import { useSyncExternalStore } from "react";
import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { pairId } from "./social";

/**
 * End-to-end encrypted direct messages. Only the two people in a chat can read what is in it; Firestore only ever holds ciphertext.
 *
 *  - Every person has one ECDH P-256 key pair. The public key is published at publicKeys/{uid}.
 *  - The private key never leaves the device in the clear. It is stored on the device as a non-extractable key (IndexedDB), and a
 *    copy encrypted with the person's passphrase is saved at users/{uid}/keyBackup/main. A new browser or device asks for the
 *    passphrase once, decrypts the backup, and from then on works like the first one (like Messenger's "restore chats").
 *  - A chat's key is derived from your private key and the other person's public key (ECDH, then HKDF). Both of you derive the same
 *    key, so every device of both people can read the whole conversation. Each message uses AES-GCM with its own random IV.
 *
 * Resetting the encryption (forgot passphrase) creates a new key pair. Messages sent before it can no longer be read.
 */

export const MIN_PASSPHRASE = 10;
const PBKDF2_ITERATIONS = 600_000;
const FORMAT = "1";
const NO_PUBLIC_KEY = "This person has not turned on encrypted messages yet. They need to open Messages in VibeBook once; then you can send this.";

/** What a reply points at (a short copy, so it can be shown without loading the old message). */
export type ReplyRef = { id: string; from: string; text: string; image?: boolean; gif?: boolean };
/**
 * A line the chat shows to both people when something about it changes ("You pinned a message"). It travels as an ordinary
 * encrypted message, so the server learns nothing about it. `k` says what happened; `who` is whose nickname changed, `nick` the new
 * one (empty = removed), and `mid` the message that was pinned or unpinned.
 */
export type Notice =
  | { k: "emoji"; emoji: string }
  | { k: "nick"; who: string; nick: string }
  | { k: "pin" | "unpin"; mid: string };

/** Everything inside an encrypted message, reaction or pin. `reply`, `fwd` and `sys` belong to messages; `from` and `at` to pins. */
export type Payload = { text?: string; image?: string; gif?: string; reply?: ReplyRef; fwd?: boolean; sys?: Notice; from?: string; at?: number };

export type KeyPhase = "loading" | "setup" | "locked" | "ready" | "error";
export type KeyStatus = { phase: KeyPhase; error: string };

type Local = { priv: CryptoKey; pub: string };
type Backup = { v: number; iters: number; salt: string; iv: string; ct: string };

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const te = new TextEncoder();
const td = new TextDecoder();

// ---------- small helpers ----------

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Encrypted messages need a secure connection (https). Open VibeBook from its https address.");
  return s;
}
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const publicRef = (uid: string) => doc(db, "publicKeys", uid);
const backupRef = (uid: string) => doc(db, "users", uid, "keyBackup", "main");

// ---------- this device's key (IndexedDB) ----------

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("vibebook-e2ee", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function readLocal(uid: string): Promise<Local | undefined> {
  const store = await openStore();
  return new Promise((resolve, reject) => {
    const req = store.transaction("keys").objectStore("keys").get(uid);
    req.onsuccess = () => resolve(req.result as Local | undefined);
    req.onerror = () => reject(req.error);
  });
}
async function changeLocal(uid: string, value: Local | null): Promise<void> {
  const store = await openStore();
  return new Promise((resolve, reject) => {
    const tx = store.transaction("keys", "readwrite");
    if (value) tx.objectStore("keys").put(value, uid); else tx.objectStore("keys").delete(uid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- the passphrase backup ----------

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", te.encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function wrap(passphrase: string, privateKey: Uint8Array<ArrayBuffer>): Promise<Backup> {
  const salt = random(16);
  const iv = random(12);
  const key = await passphraseKey(passphrase, salt, PBKDF2_ITERATIONS);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv }, key, privateKey));
  return { v: 1, iters: PBKDF2_ITERATIONS, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}
async function unwrap(passphrase: string, b: Backup): Promise<Uint8Array<ArrayBuffer>> {
  const key = await passphraseKey(passphrase, fromB64(b.salt), b.iters);
  try {
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: fromB64(b.iv) }, key, fromB64(b.ct)));
  } catch {
    throw new Error("That passphrase is not right.");
  }
}
async function readBackup(uid: string): Promise<Backup> {
  const snap = await getDoc(backupRef(uid));
  if (!snap.exists()) throw new Error("No encryption backup was found. Reset encryption to start over.");
  return snap.data() as Backup;
}
function checkPassphrase(passphrase: string) {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Your passphrase needs at least ${MIN_PASSPHRASE} characters.`);
}

/** A random passphrase to suggest: 20 characters (100 bits) from an alphabet without look-alike letters, like ABCDE-FGHJK-MNPQR-STUVW. */
export function generatePassphrase(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 characters, so a byte & 31 is uniform
  const chars = Array.from(random(20), (b) => alphabet[b & 31]).join("");
  return chars.match(/.{5}/g)!.join("-");
}

// ---------- state for the screens ----------

let uid = "";
let priv: CryptoKey | null = null;
let status: KeyStatus = { phase: "loading", error: "" };
const subs = new Set<() => void>();
const publicKeys = new Map<string, string>();
const fetchedAt = new Map<string, number>();
const RECHECK_MS = 30_000;
const chatKeys = new Map<string, CryptoKey>();
const opened = new Map<string, Payload>();

function setStatus(phase: KeyPhase, error = "") {
  status = { phase, error };
  subs.forEach((f) => f());
}
function requireUid(): string {
  if (!uid) throw new Error("Not signed in.");
  return uid;
}

async function load(userId: string) {
  try {
    const [local, remote] = await Promise.all([readLocal(userId), getDoc(publicRef(userId))]);
    if (uid !== userId) return;
    const remotePub = remote.exists() ? (remote.data().key as string) : "";
    if (local && local.pub === remotePub) { priv = local.priv; return setStatus("ready"); }
    if (local) await changeLocal(userId, null); // the encryption was reset on another device: this copy is out of date
    if (uid === userId) setStatus(remotePub ? "locked" : "setup");
  } catch (err) {
    if (uid === userId) setStatus("error", err instanceof Error ? err.message : "Could not check your encryption keys.");
  }
}

/** Starts looking at this person's keys. Called once when they are signed in (Shell); call the returned function when they leave. */
export function startE2ee(userId: string): () => void {
  uid = userId;
  priv = null;
  publicKeys.clear(); fetchedAt.clear(); chatKeys.clear(); opened.clear();
  setStatus("loading");
  load(userId);
  return () => { if (uid === userId) { uid = ""; priv = null; } };
}
export const retryE2ee = () => { const u = requireUid(); setStatus("loading"); load(u); };

const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export const useE2ee = (): KeyStatus => useSyncExternalStore(subscribe, () => status);

// ---------- setting up, unlocking, changing ----------

/** First-time setup, or starting over after a forgotten passphrase (old messages become unreadable). */
export async function createKeys(passphrase: string): Promise<void> {
  const userId = requireUid();
  checkPassphrase(passphrase);
  const pair = await subtle().generateKey(ECDH, true, ["deriveBits"]);
  const pkcs8 = new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey));
  const pub = toB64(new Uint8Array(await subtle().exportKey("raw", pair.publicKey)));
  const batch = writeBatch(db);
  batch.set(backupRef(userId), { ...(await wrap(passphrase, pkcs8)), createdAt: serverTimestamp() });
  batch.set(publicRef(userId), { key: pub, createdAt: serverTimestamp() });
  await batch.commit();
  const key = await subtle().importKey("pkcs8", pkcs8, ECDH, false, ["deriveBits"]);
  await changeLocal(userId, { priv: key, pub });
  priv = key;
  publicKeys.delete(userId); chatKeys.clear(); opened.clear();
  setStatus("ready");
}

/** A new browser or device: the passphrase opens the backup and this device gets the key. Throws when the passphrase is wrong. */
export async function unlockKeys(passphrase: string): Promise<void> {
  const userId = requireUid();
  const pkcs8 = await unwrap(passphrase, await readBackup(userId));
  const pub = (await getDoc(publicRef(userId))).data()?.key as string | undefined;
  if (!pub) throw new Error("Your public key is missing. Reset encryption to start over.");
  const key = await subtle().importKey("pkcs8", pkcs8, ECDH, false, ["deriveBits"]);
  await changeLocal(userId, { priv: key, pub });
  priv = key;
  chatKeys.clear(); opened.clear();
  setStatus("ready");
}

export async function changePassphrase(current: string, next: string): Promise<void> {
  const userId = requireUid();
  checkPassphrase(next);
  const pkcs8 = await unwrap(current, await readBackup(userId));
  await setDoc(backupRef(userId), { ...(await wrap(next, pkcs8)), createdAt: serverTimestamp() });
}

// ---------- encrypting and decrypting ----------

async function theirPublicKey(other: string, fresh: boolean): Promise<string> {
  const known = publicKeys.get(other);
  if (known && !fresh) return known;
  const snap = await getDoc(publicRef(other));
  const key = snap.data()?.key as string | undefined;
  if (!key) throw new Error(NO_PUBLIC_KEY);
  publicKeys.set(other, key);
  fetchedAt.set(other, Date.now());
  return key;
}

/** The AES key for one chat, the same for both people (and every device of theirs). */
async function chatKey(other: string, theirPub: string): Promise<CryptoKey> {
  if (!priv) throw new Error("Unlock your encrypted messages first.");
  const id = `${other}:${theirPub}`;
  const known = chatKeys.get(id);
  if (known) return known;
  const pub = await subtle().importKey("raw", fromB64(theirPub), ECDH, false, []);
  const bits = await subtle().deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const hkdf = await subtle().importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  const key = await subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: te.encode(pairId(requireUid(), other)), info: te.encode("vibebook-dm-v1") },
    hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
  chatKeys.set(id, key);
  return key;
}

/** Encrypts each payload for a chat with `other`. Throws when they have no key yet or yours is locked. */
export async function sealFor(other: string, payloads: Payload[]): Promise<string[]> {
  const key = await chatKey(other, await theirPublicKey(other, true));
  const additionalData = te.encode(pairId(requireUid(), other));
  return Promise.all(payloads.map(async (p) => {
    const iv = random(12);
    const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData }, key, te.encode(JSON.stringify(p))));
    return `${FORMAT}.${toB64(iv)}.${toB64(ct)}`;
  }));
}

/** Reads something sealed by `sealFor` in a chat with `other` (sent by either of you). Throws when it cannot be read. */
export async function openFrom(other: string, sealed: string): Promise<Payload> {
  const cacheKey = `${other}:${sealed.slice(0, 24)}`; // the random IV makes this unique
  const known = opened.get(cacheKey);
  if (known) return known;
  const [format, iv, ct] = sealed.split(".");
  if (format !== FORMAT || !iv || !ct) throw new Error("Unknown message format.");
  const additionalData = te.encode(pairId(requireUid(), other));
  const attempt = async (fresh: boolean) => {
    const key = await chatKey(other, await theirPublicKey(other, fresh));
    return JSON.parse(td.decode(await subtle().decrypt({ name: "AES-GCM", iv: fromB64(iv), additionalData }, key, fromB64(ct)))) as Payload;
  };
  let payload: Payload;
  try {
    payload = await attempt(false);
  } catch (err) {
    // They may have reset their key since it was cached: look again, but not for every message of a chat that cannot be read.
    if (!priv || Date.now() - (fetchedAt.get(other) ?? 0) < RECHECK_MS) throw err;
    payload = await attempt(true);
  }
  opened.set(cacheKey, payload);
  return payload;
}
