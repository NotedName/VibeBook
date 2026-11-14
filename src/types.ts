export type Visibility = "private" | "friends" | "public";

export const VISIBILITY: { id: Visibility; label: string; hint: string }[] = [
  { id: "private", label: "Only me", hint: "Only you can see this entry." },
  { id: "friends", label: "Friends", hint: "You and your friends can see this entry." },
  { id: "public", label: "Public", hint: "Friends and anyone who follows you can see this entry." },
];

export type CoverId = "amethyst" | "dusk" | "steel";
export const COVERS: { id: CoverId; label: string }[] = [
  { id: "amethyst", label: "Amethyst" },
  { id: "dusk", label: "Dusk" },
  { id: "steel", label: "Steel" },
];

/** Public profile, stored at profiles/{uid}. Never contains the email address. */
export type Profile = {
  uid: string;
  displayName: string;
  headline: string;
  workplace: string;
  bio: string;
  avatar: string; // small JPEG data URL, "" when none
  cover: CoverId;
};

export type FriendRequest = { id: string; from: string; to: string };

export type Relation = "self" | "friends" | "incoming" | "outgoing" | "none";

/** Stored at groups/{id}. Every group is open: anyone signed in can find it and join. */
export type Group = { id: string; name: string; description: string; ownerUid: string };

/** firestore.rules only looks at the first five groupIds of an entry. */
export const MAX_GROUPS_PER_ENTRY = 5;
