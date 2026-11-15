# Abuse and flooding protection (VibeBook)

VibeBook runs on Firebase (Hosting + Firestore), so the network-level part of DoS/DDoS protection is Google's. What the app
adds on top is below.

## What is in the code
- `src/rateLimit.ts`: a client-side brake (entries 5/min, comments 10/min, messages 20 per 30 s, friend requests 20/min).
  It stops accidents and slows scripts that drive the page. It cannot stop someone who calls Firestore directly.
- `firestore.rules`, `rate/{uid}`: the server-side limit. A new entry is accepted only together with a `rate/{uid}.entryAt`
  stamp written in the same batch, and that stamp is refused if the last one is under 5 seconds old.
- `src/firebase.ts`: Firebase App Check, switched on by `VITE_APPCHECK_SITE_KEY` in `.env`.

## Steps you do once in the Firebase console
1. App Check > Apps > your web app > register with **reCAPTCHA v3** (create the key at google.com/recaptcha/admin) and put the
   site key in `.env` as `VITE_APPCHECK_SITE_KEY`. Rebuild and deploy.
2. Run `npm run dev` once: the browser console prints a debug token. Register it under App Check > Apps > Manage debug tokens.
3. Watch App Check > Metrics for a day. When almost every request is "verified", press **Enforce** for Cloud Firestore.
   (The Android app inside Tauri cannot use reCAPTCHA. Add its own App Check provider before enforcing, or it will be blocked.)
4. Google Cloud console > Billing > Budgets & alerts: add a budget alert, so a flood shows up as a notification, not a surprise.
5. `firebase deploy --only firestore` for the new rules, then `npm run deploy`.

## Limits worth knowing
- Comments and messages are throttled in the app only. Their rules already make many document reads, and Firestore allows
  at most 10 per request, so adding the rate check there should be tested in the Firebase emulator first.
- Rules cannot count requests, only compare timestamps, so this is a minimum gap, not a true "N per minute".
