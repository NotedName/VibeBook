/**
 * WHAT'S NEW, shown in Settings > About > "What's new".
 *
 * NOTE FOR ANY AI ASSISTANT (or developer) WHO CHANGES THIS APP, NOW OR IN THE FUTURE:
 *   Every time you add, change, move or fix something that a person using the app can notice, add a line to the NEWEST release below
 *   (or start a new release at the top, with today's date) in plain, short, friendly language. Say what the person can now do or what
 *   behaves differently, not which file you touched. Keep the list newest first. Also keep the "About" list in SettingsSheet.tsx
 *   true when a main feature is added or removed, and mention a new Firestore rule in the release so it is not forgotten to deploy.
 *   The same instruction is in AGENTS.md at the root of the project, and the owner's other lasting rules are in /.ai/conventions.json.
 */
export type Release = { date: string; title: string; changes: string[] };

export const CHANGELOG: Release[] = [
  {
    date: "2026-11-19",
    title: "Forms that match the school's, tour and tidy-up",
    changes: [
      "The DTR, Term Journal, Training Plan and evaluation forms now follow the school's documents closely, with an address line you can change.",
      "Evaluation forms: make a link for your supervisor, who rates you and prints the form. You never see their answers.",
      "The DTR has a supervisor name, and the plan has a company and the first day of deployment.",
      "A short tour for new people, with Skip, and again for new features. Replay it from Settings > About.",
      "Open someone's note to read it and reply, as in Messenger.",
      "Tap Skills in your logbook to see every skill. Edit logged hours without opening the entry.",
      "Settings > Data & Account can reset the hours timer, archive all entries or delete all entries.",
      "Sort goes back to Newest when you leave a tab, and shows a tag when it is not Newest.",
      "Changed dates stay marked after the day has passed.",
      "Buttons are rounded squares, menus follow Material 3, and animations are springier.",
      "Headline is now Position.",
    ],
  },
  {
    date: "2026-11-18",
    title: "OJT forms, smarter chats, tidier logbook",
    changes: [
      "Export the school's OJT forms: Daily Time Record, Term Journal Report, Training Evaluation Report and Evaluation Comments, as Word or PDF.",
      "The Daily Time Record is made from your logged hours. The evaluation forms come with your details filled in so your supervisor can edit them.",
      "The Term Journal asks the six questions in the export screen and prints your answers in the school's format.",
      "Shared entries in a chat now appear as a card, like Messenger. Reply and quick-react buttons sit beside the message menu.",
      "Pick your own quick-react emoji in Settings (this device only), with a button to go back to the original.",
      "The chat box is a rounded rectangle, the emoji button is inside it, and the camera and photo buttons fold away while you type on a small screen.",
      "Settings has a Clear suggestion history button, and suggestions are chips you switch on and off.",
      "The feed has a search button, and the People tab is now called Friends, with a clear Find people search.",
      "Logbook: Days shows only days and their hours; Weeks shows each week with its days. The Likes tab is now Vibes.",
      "Add an entry for a workday you missed, or mark it as a day off (holiday or absent). Changing single dates now toggles on and off.",
      "You can set the time an entry is about (when it happened) without changing the time it was actually posted.",
      "If the network is down you now see \"Network unavailable\" or a loading skeleton, not \"Profile not found\" or an empty Edit profile.",
      "Group owners can choose a default cover photo, and join requests moved into Manage members.",
      "Posts shared to a private group have their own \"Who can see this\" choice for your profile.",
      "Inputs and search bars share one rounded-square shape, and screens adapt better to foldables.",
      "Times are chosen from hour, minutes and AM/PM lists instead of typed.",
      "The hours card now says what is planned this week (available days × hours a day) next to what you logged.",
      "An entry shows when it was really posted. You can change the date and time it is about, but not the posted time.",
      "Marked holidays and absences stay marked, so past days off no longer count as missed workdays.",
    ],
  },
  {
    date: "2026-11-17",
    title: "Training plan, interactions and suggestions",
    changes: [
      "Export a Training Plan built from the activities in your entries.",
      "View interactions on your own entries: who vibed and who passed.",
      "Days, Weeks and Months views in other people's logbooks.",
      "A Past hours button lets you add hours for days you forgot to log.",
      "Edit an entry's date and time. Activities are separated by commas, like skills.",
      "A daily reminder to log your work, a 24-hour note on your profile, and owners can delete a group.",
    ],
  },
];
