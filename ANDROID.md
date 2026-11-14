# Building the VibeBook Android app (APK)

**What you are building:** a Tauri 2 app (a Rust program) that shows your existing VibeBook web app inside an Android window. Firebase stays exactly as it is. The app needs the internet; with no connection it shows an **"Unavailable offline"** screen with a Try again button, and leaves by itself when the connection returns.

> Status: the code changes are made, but I could not build the APK where I work (no Android SDK, Rust or network there). Steps 1 to 6 are the standard Tauri 2 route. If a command is rejected, run it with `--help` first, since flags can differ between Tauri versions.

## What is already done in the project
- `src/OfflineGate.tsx`: the offline screen. It only appears inside the app (never in a normal browser). It checks when the app opens, when the connection drops, and when you press Try again.
- `src/platform.ts`: tells the app it is running as the Android app, and gives share links the **public website address**. Inside the app the page address is private, so without this, "Copy link" would produce links nobody else could open. It uses `https://vibebook.web.app/` by default; if your site address is different, add `VITE_PUBLIC_URL=https://your-site/` to `.env`.
- `src-tauri/`: the Rust project, with the Android entry point and `useHttpsScheme: true`. Decide this now: changing it later changes the app's address and signs everyone out.
- The app id is `app.vibebook`. Pick the final one now: it cannot change once the app is on a store.

## 1. Install the tools (once)
1. **Rust:** install from rustup.rs.
2. **Android Studio.** In SDK Manager, install: Android SDK Platform (latest), Platform-Tools, Build-Tools, Command-line Tools, and **NDK (Side by side)**.
3. **Environment variables** (Windows PowerShell shown; use your shell's equivalent on Mac or Linux). Adjust the paths to what you installed:
   ```powershell
   [System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
   [System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
   $ndk = (Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\ndk" | Select-Object -Last 1).FullName
   [System.Environment]::SetEnvironmentVariable("NDK_HOME", $ndk, "User")
   ```
   Close and reopen the terminal afterwards.
4. **Rust targets for Android:**
   ```
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```

## 2. Set up the project (once)
```
npm install
npm i -D @tauri-apps/cli@^2
npm run tauri icon app-icon.png      # included: the favicon book mark on the dark app colour
npm run tauri android init           # creates src-tauri/gen/android; commit that folder
```
Make sure `.env` (your Firebase keys) is present, because the build bakes it into the app.

## 3. Try it on a phone
Turn on Developer options and USB debugging on the phone and plug it in, or start an emulator from Android Studio. Then:
```
npm run tauri android dev
```
**Test the offline screen:** switch on airplane mode. The "Unavailable offline" screen should cover the app, and switching it off again should bring the app back.

## 4. Build an APK to install on phones
```
npm run tauri android build -- --apk
```
The APK appears under `src-tauri/gen/android/app/build/outputs/apk/`. Copy it to a phone and open it (Android will ask to allow installing from that source). To build a debug version that installs without any signing set-up, add `--debug`.

## 5. Sign it for real releases
A release APK must be signed before phones will install it. Create a keystore with `keytool`, point the Gradle signing config in `src-tauri/gen/android/app/build.gradle.kts` at it through a `keystore.properties` file, and follow the "Android code signing" page in the Tauri docs for the exact lines. **Back up the keystore and its passwords and never commit them.** If you lose the key, you can never update the app under the same id. The Play Store wants an `.aab`: `npm run tauri android build -- --aab`.

## 6. Check these Firebase settings
- **API key restrictions** (Google Cloud Console, Credentials): if the key is limited to certain websites, add `https://tauri.localhost/*` or sign-in from the app will fail.
- **Verification emails:** the link opens in the phone's browser and verifies the account; the person then returns to the app. Test the whole sign-up path once.

## 7. Things to test on a real phone
| Feature | Why |
|---|---|
| Sign up, verify email, sign in, stay signed in after closing the app | Firebase sign-in is kept inside the app |
| Add photos from gallery and camera | The Android file chooser inside the app |
| **Save photo** (download) | Likely not to work yet: `download.ts` uses a browser download. Needs the Tauri dialog and file plugins (next step) |
| Copy for Daily Report, Share | Clipboard and Android share sheet |
| Back button | It should go back through screens, then leave the app |
| Keyboard and the notch/status bar | Safe areas are already handled in the CSS |
| Copy a share link and open it in a browser | It should be the public website address |

## 8. Next steps (not done yet)
1. **Saving photos on Android:** add the Tauri dialog and fs plugins and call them from `download.ts` when `isNativeApp` is true.
2. **Opening share links in the app** (Android App Links): needs a Digital Asset Links file on your website and the Tauri deep-link plugin.
3. **Push notifications:** the bell works while the app is open. Pushes when it is closed need Firebase Cloud Messaging.
4. **Move image resizing into Rust** (see `RUST_PREP.md`, phase 2).
