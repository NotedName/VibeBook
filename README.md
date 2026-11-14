# Phase 2, step 1: photo work in Rust

The page side is already in the project (`src/native.ts`, called from `src/image.ts`). It asks the app's Rust code to resize and compress pictures, and **falls back to the old canvas code** whenever Rust is not available (browser, or the command not added yet). So nothing changes until you add the Rust side below.

These Rust files were **not compiled** where I wrote them (no Rust toolchain here). Expect to fix a small compile error or two on the first build; paste it to me if so.

## Add the Rust side (about 5 minutes)
1. Copy `image_ops.rs` to `src-tauri/src/image_ops.rs`.
2. Replace `src-tauri/src/lib.rs` with `lib.rs` from this folder (it is your current file plus `mod image_ops;` and the new command in `generate_handler!`).
3. In `src-tauri/Cargo.toml`, under `[dependencies]`, add:
   ```
   image = { version = "0.25.6", default-features = false, features = ["jpeg", "png", "webp"] }
   ```
4. In `src-tauri/capabilities/default.json` nothing is needed: your own commands are allowed by default.
5. `npm run tauri android dev`. Change your profile photo and add an entry photo; both should still work.

## How to tell it is really using Rust
Temporarily add `console.log("rust")` after `if (fromRust) return fromRust;` in `src/image.ts`, or watch the terminal for the first Rust build error: if the command name is wrong the app silently uses canvas.

## Notes
- Phone photos are normally JPEG, which this handles. HEIC/HEIF is not supported by the `image` crate; those fall back to the canvas code.
- The page sends the picture as raw bytes (not JSON) and gets raw bytes back, so multi-megabyte photos stay fast.
- Settings that stay the same as before: longest side and quality from `photoQuality()`, 900,000-character limit, avatar 256 px square, cover 3:1.
