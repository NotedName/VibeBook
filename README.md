# OJT Logbook

1. Firebase console (Spark plan): create a project, add a Web app, enable Authentication > Email/Password, create a Firestore database.
2. `cp .env.example .env` and fill in the four values from the Web app config.
3. `npm install`
4. `npx firebase-tools login && npx firebase-tools use <project-id>`
5. `npx firebase-tools deploy --only firestore:rules` (publishes `firestore.rules`)
6. `npm run dev` to try it locally, `npm run deploy` to publish to Hosting.
