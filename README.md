# VibeBook

1. Firebase console (Spark plan): create a project, add a Web app, enable Authentication > Email/Password, create a Firestore database.
2. `cp .env.example .env` and fill in the four values from the Web app config.
3. `npm install`
4. `npx firebase-tools login && npx firebase-tools use <project-id>`
5. `npx firebase-tools deploy --only firestore:rules` (publishes `firestore.rules`)
6. `npm run dev` to try it locally, `npm run deploy` to publish to Hosting.

## Profiles, friends and sharing

- Every person has a public profile at `profiles/{uid}` (name, headline, company or school, bio, photo, cover color). The email address is never stored there.
- Each entry is **Only me**, **Friends** or **Public**. Entries made before this feature count as Only me.
- People can send friend requests (the other person accepts or declines) or follow someone without approval. Friends see Friends and Public entries; followers see Public ones.
- `npm run deploy` publishes hosting, the Firestore rules and the Firestore index. The new feed query needs that index, which can take a minute or two to build after the first deploy.
