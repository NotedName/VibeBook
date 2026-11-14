# Moving VibeBook to Rust: preparation

VibeBook today is a React + TypeScript web app (about 8,000 lines) on Firebase (Auth and Firestore). "Make it a Rust app" can mean three different things. Pick one before writing code.

## 1. Pick a path

| Path | What it is | Effort | Keeps Firebase? | Recommended? |
|---|---|---|---|---|
| **A. Tauri shell** | Rust app that hosts the existing React UI in a native window. Rust handles files, images, clipboard, notifications and storage. | Days to a couple of weeks | Yes, unchanged | **Start here** |
| **B. Rust UI** | Rewrite the screens in Rust (Leptos for web/Tauri, or Dioxus for web, desktop and mobile). | Months | Yes, but see "Firebase gaps" | Later, if you want no JavaScript |
| **C. Rust backend** | Replace Firebase with your own server (Axum + Postgres + WebSockets). | Months, the hardest part is `firestore.rules` | No | Only if you must leave Firebase |

Path A is also the first step of B and C: the app stays shippable while pieces move to Rust one at a time.

**Questions to answer first**
1. Which targets: Windows/macOS/Linux, Android, iOS? (Tauri 2 supports all of these; check that the plugins you need support mobile.)
2. Must it work offline? Today it needs a connection.
3. Is leaving Firebase a goal, or only a means?

## 2. What the code actually depends on

| Area | Where | Why it matters for Rust |
|---|---|---|
| Firebase Auth | `AuthForm`, `VerifyEmail`, `App`, `session.tsx` | Email and password, email verification. Rust has no official client; the REST API (Identity Toolkit) works. |
| Firestore | 22 imports, 46 `onSnapshot` live listeners, 49 batch, transaction and server-timestamp calls | **Biggest gap.** No official Rust client SDK, and live listeners are not a plain REST feature. |
| Security rules | `firestore.rules` (31 KB, 20 collections) | Access control lives here. Path C means rewriting every rule as server code and tests. |
| Photos | `image.ts`, `PhotoEditor.tsx` (canvas, `createImageBitmap`) | Photos are JPEG **data URLs inside Firestore documents** (900,000 character cap). Good candidate for the Rust `image` crate. |
| Browser-only APIs | `download.ts` (anchor download), `report.ts` (clipboard), `EntryCard` (`navigator.share`), `localStorage` in 8 files | Need native replacements in a shell: save dialog, clipboard plugin, share sheet, settings file. |
| Network | Giphy search in `stickers.ts` | Works in a webview; allow the domain in the app's security policy. |
| Routing | `#/...` hash routes | Works unchanged in a webview. |

### Collections (from `firestore.rules`)
`profiles`, `usernames`, `users/{uid}/entries` (with `photos`, `comments`, `reactions`), `users/{uid}/reposts | likes | friendList | notifications | activity | following`, `groups` (with `bans`, `posts`), `groupMembers`, `groupInvites`, `friendRequests`, `friendships`.

## 3. Firebase gaps when you use Rust

- **Auth:** call the Identity Toolkit REST endpoints with your Web API key. Store the refresh token in the OS keychain (the `keyring` crate), not in a file.
- **Reads and writes:** Firestore has a REST API that honours your security rules when you send the user's ID token. Batches and transactions exist there too.
- **Live updates:** the part to prove first. Options: (a) keep the Firebase JS SDK inside the Tauri webview (path A, nothing to prove), (b) poll over REST, (c) a gRPC streaming client in Rust. Build a one-listener spike before committing to anything but (a).
- I have not tested any of this against your project. Treat the list as a research checklist, not a verified design.

## 4. Plan

**Phase 0: decide** (above).

**Phase 1: shell** (`src-tauri/` is already scaffolded)
1. `npm i -D @tauri-apps/cli@^2`, install Rust (`rustup`) and your OS build tools from the Tauri prerequisites page.
2. Put a 1024 px square PNG at `app-icon.png`, then `npm run tauri icon app-icon.png`.
3. `npm run tauri dev`. Sign in, post an entry, react. Everything should behave like the web app.
4. Set a real content security policy in `tauri.conf.json` (Firebase, Giphy and your own domains only) instead of `null`.

**Phase 2: move native-feeling work into Rust commands**
1. Image resize, crop, rotate and JPEG compression (`compressImage`, `squareAvatar`, PhotoEditor output) with the `image` crate.
2. Save photos with a native save dialog instead of `download.ts`.
3. Clipboard for "Copy for Daily Report", native share, OS notifications for the bell.
4. Settings and the pending username in a config file or keychain instead of `localStorage`.
5. Put each of these behind one small TypeScript function (e.g. `platform.savePhoto`) that uses the browser when run on the web and Rust when run in the app, so the web version keeps working.

**Phase 3: separate data from screens (needed for paths B and C)**
Each of these modules mixes Firestore calls with React hooks. Split each into a plain data interface plus a Firebase implementation, so a different backend can be swapped in:
`entries`, `reactions`, `commentStore`, `groups`, `groupFeed`, `social`, `profiles`, `notifications`, `activity`, `likes`, `reposts`, `feed`, `friendList`.
Order: start with `reactions` and `likes` (small), end with `feed` and `sorting` (many listeners).

**Phase 4 (optional): replace the UI or the backend** with path B or C, one screen or one collection at a time.

## 5. Done already
- `src-tauri/`: minimal Tauri 2 project (window, one example command, config pointing at Vite and `dist`). **Not compiled here**, because this environment has no Rust toolchain or network. Expect to fix small version or config errors on the first `tauri dev`.
- `npm run tauri` script and `.gitignore` entries.

## 6. Risks to keep in mind
- Rewriting the rules (path C) is where most security bugs would be introduced.
- Data URLs in documents are heavy. A Rust backend would be a good moment to store photos as files or blobs instead (a data migration).
- Mobile builds add signing, store accounts and review time on top of the code.
