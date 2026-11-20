import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

function env(name: string): string {
  const value = import.meta.env[name];
  if (!value) throw new Error(`Missing ${name} in .env`);
  return value;
}

const app = initializeApp({
  apiKey: env("VITE_FIREBASE_API_KEY"),
  authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: env("VITE_FIREBASE_PROJECT_ID"),
  appId: env("VITE_FIREBASE_APP_ID"),
  // only needed for push notifications (see PUSH.md)
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
});

// App Check proves that a request comes from the real VibeBook page and not from a script. It is off until a reCAPTCHA v3 site
// key is set as VITE_APPCHECK_SITE_KEY in .env (see SECURITY.md). Even then it only blocks anything once "Enforce" is switched
// on for Firestore in the Firebase console, so it is safe to ship before that.
const appCheckKey = import.meta.env.VITE_APPCHECK_SITE_KEY as string | undefined;
if (appCheckKey) {
  // While developing (npm run dev), Firebase prints a debug token in the console to register under App Check > Apps.
  if (import.meta.env.DEV) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckKey), isTokenAutoRefreshEnabled: true });
}

export { app };
export const auth = getAuth(app);
export const db = getFirestore(app);
