import { useEffect } from "react";
import { CloseIcon } from "./icons";
import { useScrollLock } from "./scrollLock";

/** Shown when someone creates an account and in Settings > About. Bump the date when the wording changes. */
export const TERMS_UPDATED = "November 16, 2026";

const TERMS: { title: string; body: string[] }[] = [
  {
    title: "1. Accepting these terms",
    body: ["By creating a VibeBook account or using VibeBook, you agree to these Terms and Conditions. If you do not agree, please do not create an account."],
  },
  {
    title: "2. Your account",
    body: [
      "Give accurate details when you sign up and keep your password to yourself. You are responsible for what happens under your account.",
      "Your username is unique to you. VibeBook may change or remove a username that is misleading, offensive or that pretends to be someone else.",
    ],
  },
  {
    title: "3. Your entries and photos",
    body: [
      "VibeBook is meant to keep your OJT logbook. The entries, photos, videos, comments, messages and other content you add stay yours.",
      "You allow VibeBook to store and show that content to the people you choose, and only to them. Do not post anything you do not have the right to share, including confidential company information, other people's private details or work you were told to keep internal.",
    ],
  },
  {
    title: "4. Who can see what",
    body: [
      "Each entry is Only me, Friends or Public, or shared in groups you choose. Public entries can be opened by anyone who has their share link, without signing in. Friends and followers can see Public entries.",
      "Check an entry's visibility before you save it, and check your company's rules before sharing anything about your work.",
      "In Settings you also choose who can see your friends list, your hours, your schedule and when you are clocked in or on a break (only you, your friends, friends of friends or everyone). A private profile shows your entries, hours, schedule and friends only to your friends. Posts in a group are seen by that group's members, and a group's own privacy setting decides who can find and join it.",
    ],
  },
  {
    title: "5. Being respectful",
    body: [
      "Do not use VibeBook to harass, threaten or impersonate anyone, to post unlawful, hateful or sexual content, or to spread spam or malware. Do not try to access other people's accounts or data, or to disrupt the service.",
      "You can report an entry or a person. VibeBook may remove content or limit or close accounts that break these terms.",
    ],
  },
  {
    title: "6. Reactions, comments and reposts",
    body: ["Vibe and Pass are quick ways to react to an entry or a photo. Comments, reactions and reposts you make are visible to people who can see that entry, and the owner of the entry can be notified about them. Entries you give a Vibe are listed in your own Likes tab, which only you can see."],
  },
  {
    title: "7. Groups and messages",
    body: [
      "Group admins and moderators can remove posts and members who break these terms or the group's rules. You are responsible for what you post in a group.",
      "Private messages are end-to-end encrypted on the devices you use, so VibeBook cannot read them. Keep your device and password safe: messages cannot be recovered if the keys on your devices are lost. Do not use messages to harass anyone.",
    ],
  },
  {
    title: "8. Hours, reports and exports",
    body: [
      "The hours you clock or log, your required hours and the details you add to exported reports (such as your name, school, department and course) are kept in your account. They are only shown to others as you allow in Settings.",
      "VibeBook helps you keep records, but it is not an official record of your hours. Check any report you export before you hand it in; you are responsible for its accuracy.",
    ],
  },
  {
    title: "9. Your data",
    body: [
      "Your entries, photos, hours, schedule, profile and activity log are saved in your VibeBook account so they are there on every device you sign in on. You can download a backup of your entries and a zip of all your photos at any time, and delete your account in Settings. Your email address is used to sign in and to send you account emails, and it is not shown on your public profile.",
      "Settings that only affect how the app looks on a device, such as colours and text size, are kept on that device. VibeBook does not sell your personal information.",
    ],
  },
  {
    title: "10. Availability",
    body: ["VibeBook is provided as is. It may be unavailable at times and features may change. Keep your own copy of anything important, for example with the backup and report exports in Settings and your logbook."],
  },
  {
    title: "11. Changes",
    body: ["These terms may be updated from time to time. The date below shows the latest version. If you keep using VibeBook after a change, you accept the updated terms."],
  },
];

/** The terms text on its own, so Settings > About can show it inline. */
export function TermsContent() {
  return (
    <div className="terms">
      {TERMS.map((t) => (
        <section key={t.title}>
          <h3>{t.title}</h3>
          {t.body.map((p) => <p key={p}>{p}</p>)}
        </section>
      ))}
      <p className="hint">Last updated {TERMS_UPDATED}.</p>
    </div>
  );
}

/** The terms in a dialog. Used on the sign-up form, where there is no Settings yet. */
export function TermsDialog({ onClose }: { onClose: () => void }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Terms and Conditions">
        <div className="sheet-head">
          <h2>Terms and Conditions</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body"><TermsContent /></div>
        <div className="sheet-actions">
          <button type="button" className="btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
