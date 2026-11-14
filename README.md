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

## Groups

- Anyone can create a group on the **Groups** tab; every group is open, so anyone signed in can find it (search or Discover) and join.
- When you write or edit an entry, tick the groups to share it with (up to 5). Members of those groups can see and comment on it, whatever **Who can see this** says. Opening an entry sheet from inside a group ticks that group for you.
- Each group page has a feed of the entries shared to it, plus its members.
- Leaving a group also removes your entries from it.
- Data: `groups/{id}`, `groupMembers/{groupId}_{uid}`, and `groups/{id}/posts/{ownerUid}_{entryId}` (a small index of what is shared). The entry itself stays in `users/{uid}/entries` with a `groupIds` list, so there is one copy of the text, photos and comments.

## Comments

- **Comment** on any entry you can see, your own included. Comments live at `users/{uid}/entries/{id}/comments`. Authors and the entry owner can delete a comment; comments cannot be edited.

## Sign-up and email verification

- Create account asks for a name (used as the first profile name), email and a password of 8+ characters with a strength hint.
- A verification email is sent on sign-up. Until the address is verified the app shows a "Verify your email" screen (resend with a 30 second cooldown, and it re-checks when you return to the tab).
- `firestore.rules` also requires `email_verified`, so the data is locked until then. **Accounts created before this change that never verified will see the verify screen once.**
- Firebase console: Authentication > Templates lets you edit the verification email's wording and sender name.

After pulling these changes run `npm run deploy` so the new rules go live together with the app.
