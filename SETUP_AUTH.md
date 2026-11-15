# Password reset, encrypted messages, private files

## 1. Password reset emails (one-time Firebase console step)
Firebase's own reset page asks for the new password once. VibeBook has its own page that asks twice (`src/AuthAction.tsx`).
To use it: Firebase console > Authentication > Templates > any template > pencil > **customize action URL** and enter your
site address, e.g. `https://vibebook.web.app/`. It applies to every email template, and VibeBook handles both the
reset-password and the confirm-email links.

## 2. Deploy the rules
`npm run deploy` (adds `publicKeys`, `users/{uid}/keyBackup`, and requires encrypted messages).

## 3. Encrypted messages
See the header of `src/e2ee.ts`. Everyone sets a passphrase the first time they open Messages; a new browser asks for it once.
Messages sent before this update stay readable; new ones are encrypted. The other person must have opened Messages once to
receive encrypted messages.

## 4. Private files
`npm run privacy` (also runs after `npm install`) adds `.env`, keys, service accounts, keystores and Firebase caches to
`.gitignore` and stops Git tracking any of them that were already committed. Copy `.env.example` to `.env` on a new machine.
