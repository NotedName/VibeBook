# VibeBook

1. Firebase console (Spark plan): create a project, add a Web app, enable Authentication > Email/Password, create a Firestore database.
2. `cp .env.example .env` and fill in the four values from the Web app config.
3. `npm install`
4. `npx firebase-tools login && npx firebase-tools use <project-id>`
5. `npx firebase-tools deploy --only firestore:rules` (publishes `firestore.rules`)
6. `npm run dev` to try it locally, `npm run deploy` to publish to Hosting.

## Profiles, friends and sharing

- Every person has a public profile at `profiles/{uid}` (name, headline, company or school, bio, photo, cover color, optional cover photo). The email address is never stored there.
- Each entry is **Only me**, **Friends** or **Public**. Entries made before this feature count as Only me.
- People can send friend requests (the other person accepts or declines) or follow someone without approval. Friends see Friends and Public entries; followers see Public ones.
- `npm run deploy` publishes hosting, the Firestore rules and the Firestore index. The new feed query needs that index, which can take a minute or two to build after the first deploy.

## Cover photo, date and time

- **Edit profile > Cover photo** adds a banner photo (centre-cropped to 3:1 and stored as a small JPEG on the profile). It shows over the cover color; removing it brings the color back. `firestore.rules` caps it at 120,000 characters, so redeploy the rules.
- An entry's date and time are stamped automatically when you open **New entry** and cannot be typed in. Editing an entry keeps its original date and time.

## Groups

- Anyone can create a group on the **Groups** tab; every group is open, so anyone signed in can find it (search or Discover) and join.
- When you write or edit an entry, tick the groups to share it with (up to 5). Members of those groups can see and comment on it, whatever **Who can see this** says. Opening an entry sheet from inside a group ticks that group for you.
- Each group page has a feed of the entries shared to it, plus its members.
- Leaving a group also removes your entries from it.
- Invites: `groupInvites/{groupId}_{toUid}`. Any member can invite several people at once from the group page; the invited person sees it under Groups (with a badge on the tab) and can join or decline.
- Comments can carry a sticker (an emoji from `src/stickers.ts`) or a GIF (Giphy or Tenor links only, enforced in `firestore.rules`). For in-app GIF search, add `VITE_GIPHY_KEY=<your Giphy API key>` to `.env`; without it people paste a GIF link instead.
- Data: `groups/{id}`, `groupMembers/{groupId}_{uid}`, and `groups/{id}/posts/{ownerUid}_{entryId}` (a small index of what is shared). The entry itself stays in `users/{uid}/entries` with a `groupIds` list, so there is one copy of the text, photos and comments.

## Comments

- **Comment** on any entry you can see, your own included. Replies nest under the comment they answer, Reddit-style, up to 5 levels; **Hide replies** collapses a branch.
- Every comment has a **Like** (one per person; tap again to take it back). Comments are stored at `users/{uid}/entries/{id}/comments` with `parentId` ("" for top level) and a `likes` list of uids. Comments written before replies existed show as top-level, with no likes.
- Authors and the entry owner can delete a comment. A comment that has replies is blanked to **[deleted]** so the thread keeps its shape; one without replies is removed. Text cannot be edited.
- Run `npm run deploy` so the new rules (replies, likes) go live with the app.

## Editing photos

- A new photo on an entry has a pencil button: crop to Original, Square, 4:3 or 16:9 (drag to position, Zoom to tighten), rotate, flip, and adjust brightness, contrast and saturation. Photos already saved on an entry cannot be re-edited; remove and add them again.

## Reactions: Vibing / Not vibing

- Every entry you can see has a **Vibing** (thumbs up with a sparkle) and a **Not vibing** (thumbs down) button with live counts, in the post's bottom bar next to Comment and Share. The words show on wide screens; phones show just the icons. Copy, Edit and Delete live in the three-dot menu at the top right of the post. You get one reaction per entry; tap the same one again to take it back, or tap the other to switch.
- Data: `users/{uid}/entries/{id}/reactions/{reactorUid}` with `{ type, createdAt }`. The document id is the reactor's uid, which is what stops double-reacting. Each entry card reads its reaction documents, which is fine for a small app; if the app grows, move to a counter field.

## Video posts

- An entry can carry a **video link**: an https link to YouTube, Vimeo, or a direct `.mp4` / `.webm` file. It plays inside the entry card (stored as `videoUrl`). Only those hosts are embedded.
- Uploading video files is **not** possible on the Spark plan: since 3 February 2026 Cloud Storage for Firebase needs the Blaze plan, and Firestore documents are capped at 1 MiB, so clips cannot be stored there. Options if you want uploads later: upgrade to Blaze (it has a free allowance, and you can set a budget alert), or use a free-tier video host and paste its link.

## Sharing and viewing without an account

- **Share** on a Public entry copies (or opens the phone's share sheet for) a link like `https://<site>/#/p/<uid>/<entryId>`. Non-public entries cannot be shared by link; the button tells the owner to set the entry to Public.
- Someone without an account who opens the link sees the entry, photos, video, reaction counts and comments, read-only. Reacting, commenting, copying and everything else asks them to sign in or join. Signed-in people who open the link get the normal, fully interactive card.
- Anonymous access is read-only and "by link": signed-out visitors can fetch a single public entry, its photos, comments and reactions, and the author's profile card, but cannot list or search anything. `firestore.rules` enforces this, so run `npm run deploy` (or `firebase deploy --only firestore:rules`) for it to work.

## Sign-up and email verification

- Create account asks for a name (used as the first profile name), email and a password of 8+ characters with a strength hint.
- A verification email is sent on sign-up. Until the address is verified the app shows a "Verify your email" screen (resend with a 30 second cooldown, and it re-checks when you return to the tab).
- `firestore.rules` also requires `email_verified`, so the data is locked until then. **Accounts created before this change that never verified will see the verify screen once.**
- Firebase console: Authentication > Templates lets you edit the verification email's wording and sender name.

After pulling these changes run `npm run deploy` so the new rules go live together with the app.

## Layout, back buttons and reposts

- Layout: phones (under 600px) get a bottom tab bar; tablets and unfolded foldables (600px and up) get a left navigation rail; desktop (1024px and up) gets a full sidebar. Where the browser reports a vertical hinge, navigation sits on the left screen and content on the right. See `src/layout.css`.
- Back: pages opened from a list (a person, a group, a post) show a Back button. It follows the pages visited in the app and falls back to the parent list when the page was opened directly.
- Reposts: `users/{me}/reposts/{ownerUid}_{entryId}` points at someone else's public entry. It shows in your logbook, in your friends' feeds, and optionally in groups (`groups/{id}/posts/{me}_rp_{ownerUid}_{entryId}`). Your own entries can be shared to groups later from the entry menu. An entry written in or shared to a group always lives in your own logbook too.
