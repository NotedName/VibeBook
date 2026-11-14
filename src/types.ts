export type Visibility = "private" | "friends" | "public";

export const VISIBILITY: { id: Visibility; label: string; hint: string }[] = [
  { id: "private", label: "Only me", hint: "Only you can see this entry." },
  { id: "friends", label: "Friends", hint: "You and your friends can see this entry." },
  { id: "public", label: "Public", hint: "Friends and followers can see this entry, and anyone with its share link can view it without signing in." },
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
  coverPhoto: string; // JPEG data URL shown over the cover color, "" when none
};

export type FriendRequest = { id: string; from: string; to: string };

export type Relation = "self" | "friends" | "incoming" | "outgoing" | "none";

/** Stored at groups/{id}. Every group is open: anyone signed in can find it and join. */
export type Group = { id: string; name: string; description: string; ownerUid: string };

/**
 * What someone can do in a group. Stored on their groupMembers document; people who joined before
 * roles existed have none and count as members. The person who created the group is always an admin.
 *  - admin: everything, including changing roles, editing the group and removing anyone but the owner
 *  - moderator: removes members and takes posts out of the group's feed
 *  - member: shares and reads
 */
export type GroupRole = "admin" | "moderator" | "member";
export const ROLES: { id: GroupRole; label: string; hint: string }[] = [
  { id: "admin", label: "Admin", hint: "Manages the group, its roles and its members." },
  { id: "moderator", label: "Moderator", hint: "Removes members and takes posts out of the feed." },
  { id: "member", label: "Member", hint: "Shares entries and reads the feed." },
];
export type Member = { uid: string; role: GroupRole; joinedAt: number };

/** Stored at groupInvites/{groupId}_{toUid}: one person asking another to join a group. */
export type GroupInvite = { id: string; groupId: string; from: string; to: string };

/** Most people that can be invited in one go. */
export const MAX_INVITES_AT_ONCE = 30;

/** firestore.rules only looks at the first five groupIds of an entry. */
export const MAX_GROUPS_PER_ENTRY = 5;

export type ReactionType = "vibing" | "notvibing";
export const REACTIONS: { id: ReactionType; label: string }[] = [
  { id: "vibing", label: "Vibing" },
  { id: "notvibing", label: "Not vibing" },
];
