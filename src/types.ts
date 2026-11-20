export type Visibility = "private" | "friends" | "public";

export const VISIBILITY: { id: Visibility; label: string; hint: string }[] = [
  { id: "private", label: "Only me", hint: "Only you can see this entry." },
  { id: "friends", label: "Friends", hint: "You and your friends can see this entry." },
  { id: "public", label: "Public", hint: "Friends, followers and anyone with the share link can see this entry." },
];

/** Who can see one of your profile details (friends list, hours, schedule). "fof" is friends of friends. */
export type Audience = "private" | "friends" | "fof" | "everyone";
export const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "private", label: "Only me" },
  { id: "friends", label: "Friends" },
  { id: "fof", label: "Friends of friends" },
  { id: "everyone", label: "Everyone" },
];
export const isAudience = (x: unknown): x is Audience => AUDIENCES.some((a) => a.id === x);

export type CoverId = "amethyst" | "dusk" | "steel";
export const COVERS: { id: CoverId; label: string }[] = [
  { id: "amethyst", label: "Amethyst" },
  { id: "dusk", label: "Dusk" },
  { id: "steel", label: "Steel" },
];

/** Public profile, stored at profiles/{uid}. Never contains the email address. The username is the person's unique identifier: #/u/<username> opens their profile. */
export type Profile = {
  uid: string;
  displayName: string;
  /** Unique handle (lowercase letters, numbers, underscore). Reserved at usernames/{username}; used in the profile link. "" for accounts that predate usernames. */
  username: string;
  headline: string;
  workplace: string;
  bio: string;
  avatar: string; // small JPEG data URL, "" when none
  cover: CoverId;
  coverPhoto: string; // JPEG data URL shown over the cover color, "" when none
  /** Who can open this person's friends list. Defaults to everyone. Settings > Privacy. */
  friendsAudience: Audience;
  /** Who can see how many hours this person has logged. Defaults to only me. Settings > Privacy. */
  hoursAudience: Audience;
  /** Who can see which days this person works. Defaults to only me. Settings > Privacy. */
  scheduleAudience: Audience;
  /** Who can see when this person is clocked in, on a break, and when they resume. Defaults to only me. Settings > Privacy. */
  statusAudience: Audience;
  /**
   * Private profile (Settings > Privacy): only friends see this person's entries, hours, schedule and friends list.
   * Everyone else sees their name, photo and username, and can send a friend request. Defaults to off.
   */
  privateProfile: boolean;
  /**
   * Active status (Settings > Privacy): shows friends and people you message when you're active or recently active.
   * Defaults to on. While off, others cannot see your active status and you cannot see theirs.
   */
  activeStatus: boolean;
  /** Settings > Privacy: other people see initials instead of the profile photo, and the cover colour instead of the cover photo. */
  hideAvatar?: boolean;
  hideCover?: boolean;
  /**
   * Account deactivated (Settings > Data & account > Deactivate account). The account and its uid stay; other people see a blank
   * "Deactivated account" instead of the profile, and signing in again offers to reactivate it.
   */
  deactivated: boolean;
  /** Short 24-hour disappearing note shown at the top of Messages and on your profile. */
  note?: string;
  /** Unix ms timestamp when `note` was posted; expires after 24 hours. */
  noteAt?: number;
};

export type FriendRequest = { id: string; from: string; to: string };

export type Relation = "self" | "friends" | "incoming" | "outgoing" | "none";

/**
 * Public groups are open: anyone signed in can join. Private groups can still be found and opened (name, picture and
 * description show), but joining needs an admin's or moderator's approval, and only members see what is shared inside.
 */
export type GroupPrivacy = "public" | "private";
export const GROUP_PRIVACY: { id: GroupPrivacy; label: string; hint: string }[] = [
  { id: "public", label: "Public", hint: "Anyone on VibeBook can find this group and join it. Only members see its entries." },
  { id: "private", label: "Private", hint: "Anyone can find this group, but people ask to join and an admin or moderator approves them. Entries shared here are hidden from profiles, feeds and share links." },
];
/** Most questions an admin can ask people who want to join, and the longest question, answer and "why" message. */
export const GROUP_QUESTIONS_MAX = 5;
export const QUESTION_MAX = 120;
export const ANSWER_MAX = 300;
export const REQUEST_MESSAGE_MAX = 300;

/** Stored at groups/{id}. Groups without a privacy field (made before it existed) are public. */
export type Group = {
  id: string; name: string; description: string; ownerUid: string;
  privacy: GroupPrivacy;
  /** Asked of people requesting to join a private group. Empty for public groups. */
  questions: string[];
  /** small square JPEG data URL, "" when none */
  avatar: string;
  /** 3:1 banner JPEG data URL, "" when none */
  coverPhoto: string;
  /** the colour of the banner when there is no cover photo, the same choices as a profile */
  cover: CoverId;
};

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

/**
 * Stored at groups/{groupId}/requests/{uid}: someone asking to join a private group. Only that person and the group's
 * admins and moderators can read it. Approving it creates the membership and deletes it.
 */
export type JoinRequest = { uid: string; message: string; answers: string[]; createdAt: number };

/** Stored at groupInvites/{groupId}_{toUid}: one person asking another to join a group. */
export type GroupInvite = { id: string; groupId: string; from: string; to: string };

/** Most people that can be invited in one go. */
export const MAX_INVITES_AT_ONCE = 30;
/** The invite sheet lists at most this many people at once (closest friends first), so it never has to render a long list. */
export const INVITE_LIST_LIMIT = 8;

/** firestore.rules only looks at the first five groupIds of an entry. */
export const MAX_GROUPS_PER_ENTRY = 5;

export type ReactionType = "vibing" | "notvibing";
export const REACTIONS: { id: ReactionType; label: string }[] = [
  { id: "vibing", label: "Vibe" },
  { id: "notvibing", label: "Pass" },
];
