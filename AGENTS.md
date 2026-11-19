# Notes for AI assistants and developers working on VibeBook

**Read `.ai/conventions.json` first. It is the machine-readable list of the owner's lasting rules (Material Design 3, the updates section, short copy, the tour, export fidelity, and more). Follow every rule with `mustFollow: true`, and add a rule there when the owner asks for a new lasting convention.**

1. **Keep "What's new" up to date.** Whenever you add, change, move or fix anything a person using the app can notice, add a short plain-language
   line to the newest release in `src/changelog.ts` (or start a new release with today's date). It is shown in Settings > About > What's new.
   Write what the person can now do, not which file changed. Newest first.
2. Keep the feature list in `About` (`src/SettingsSheet.tsx`) true when a main feature is added or removed.
3. Firestore rules live in `firestore.rules`. When you add a collection, a field or a notification type, update the rules **and** say in the release
   notes that the rules need deploying (`firebase deploy --only firestore`).
4. Design follows Android Material Design 3. Shared styling lives in `src/material.css` (loaded after the older stylesheets). Fields, search bars
   and the chat box use `--radius-field`; do not make a new look for one screen.
5. Run `npx tsc --noEmit` and `npm run build` before handing the project back.
6. Preferences stored per device are in `src/preferences.ts`. Do not store anything sensitive in them.
7. Copy is short: one plain sentence for any hint or description.
8. New noticeable feature: add a step to `src/tourSteps.ts` and bump `TOUR_VERSION`.
9. Exported OJT documents must stay close to the school's original forms (see `src/formDocs.ts`).
