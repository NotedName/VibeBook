# Push notifications

The app side is built in (Settings > Notifications > Push notifications). Messenger-style pushes that arrive when the app is closed also need
a small server, because only a server can send them. That is the code in `functions/`.

1. Firebase console > Project settings > Cloud Messaging: create a **Web Push certificate** and copy the key pair's public key.
2. Add to `.env`:
   - `VITE_FIREBASE_MESSAGING_SENDER_ID=<Sender ID from Project settings > Cloud Messaging>`
   - `VITE_FIREBASE_VAPID_KEY=<the Web Push public key>`
3. Upgrade the project to the **Blaze** plan (Cloud Functions need it; small use stays inside the free quota).
4. `cd functions && npm install`, then `firebase deploy --only functions,firestore:rules`.
5. Rebuild and deploy the app. Each person turns push on in Settings on each device (iPhone needs the app added to the Home Screen first).

Messages are end-to-end encrypted, so a message push only says who wrote, never what.
