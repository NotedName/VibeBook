/**
 * The guided tour. A new person sees all steps; someone who has seen an earlier version sees only the steps marked `since` a later one.
 * When you add a feature people will notice: add a step here and raise TOUR_VERSION (a number, newest highest).
 * Keep each text to one short sentence.
 */
export const TOUR_VERSION = 3;
export type TourStep = { id: string; title: string; text: string; since: number };

export const TOUR_STEPS: TourStep[] = [
  { id: "logbook", since: 1, title: "Your logbook", text: "Add an entry for each day: what you did, the skills you used and photos." },
  { id: "hours", since: 1, title: "Hours", text: "Clock in and out, or add past hours. The card shows your progress." },
  { id: "feed", since: 1, title: "Feed", text: "See what friends post. Search posts with the magnifier." },
  { id: "groups", since: 1, title: "Groups", text: "Share entries with a group, public or private." },
  { id: "friends", since: 1, title: "Friends", text: "Find people by name or @username and add them." },
  { id: "messages", since: 1, title: "Messages", text: "Chat, reply, react, and drop a note that lasts 24 hours." },
  { id: "export", since: 1, title: "Export", text: "Make your portfolio, DTR, journal and other OJT forms as Word or PDF." },
  { id: "settings", since: 1, title: "Settings", text: "Privacy, reminders, data and What's new are in Settings." },
  { id: "forms", since: 2, title: "New: OJT forms", text: "Export your Daily Time Record and Term Journal. Send evaluation forms to your supervisor by link." },
  { id: "notes", since: 3, title: "New: notes you can reply to", text: "Open a friend's note in Messages to read it and reply." },
  { id: "chat", since: 2, title: "New: better chats", text: "Quick reply, quick react and shared entry cards." },
];
