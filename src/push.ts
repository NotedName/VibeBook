import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { app, db } from "./firebase";

/**
 * Push notifications (Settings > Notifications). This device asks for permission, gets a token from Firebase Cloud Messaging and
 * stores it under users/{uid}/pushTokens. The server side that sends the pushes is in functions/ (see PUSH.md).
 */
const VAPID = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const SENDER = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined;
const TOKEN_KEY = "vibebook.pushToken";

/** Whether push can work here: the browser supports it and the app has its push settings. */
export async function pushAvailable(): Promise<"yes" | "unsupported" | "unconfigured"> {
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !(await isSupported().catch(() => false))) return "unsupported";
  return VAPID && SENDER ? "yes" : "unconfigured";
}

export const pushEnabledHere = () => { try { return !!localStorage.getItem(TOKEN_KEY) && Notification.permission === "granted"; } catch { return false; } };

export async function enablePush(uid: string): Promise<void> {
  if ((await pushAvailable()) !== "yes") throw new Error("Push notifications are not set up on this device yet.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked. Allow them in your browser or phone settings.");
  const cfg = app.options;
  const sw = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?k=${encodeURIComponent(cfg.apiKey ?? "")}&p=${encodeURIComponent(cfg.projectId ?? "")}&s=${encodeURIComponent(SENDER!)}&a=${encodeURIComponent(cfg.appId ?? "")}`, { scope: "/firebase-cloud-messaging-push-scope" }); // its own scope, so it never replaces the app's service worker (sw.js)
  const token = await getToken(getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: sw });
  if (!token) throw new Error("Could not turn on push notifications. Try again.");
  await setDoc(doc(db, "users", uid, "pushTokens", token), { createdAt: serverTimestamp(), agent: navigator.userAgent.slice(0, 200) });
  localStorage.setItem(TOKEN_KEY, token);
}

export async function disablePush(uid: string): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  if (token) await deleteDoc(doc(db, "users", uid, "pushTokens", token)).catch(() => {});
  await deleteToken(getMessaging(app)).catch(() => {});
}
