import { logActivity } from "./activity";
import { useEffect, useState } from "react";
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp,
  updateDoc, type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { NO_MEDIA, type Media } from "./stickers";
import { dropNote, pushNote } from "./notifications";
import { takeTurn } from "./rateLimit";

export const COMMENT_MAX = 500;
/** Levels of replies shown: a top-level comment is level 1. Comments on the last level cannot be replied to. */
export const MAX_DEPTH = 5;

export type Comment = {
  id: string;
  authorUid: string;
  /** may be "" when the comment is only a sticker or GIF */
  text: string;
  /** an emoji sticker from our packs, "" when none */
  sticker: string;
  /** https url of a GIF on Giphy or Tenor, "" when none */
  gif: string;
  createdAt: Timestamp | null;
  /** id of the comment this replies to, "" for a top-level comment */
  parentId: string;
  /** uids of people who liked it */
  likes: string[];
  /** a comment that had replies when it was deleted stays as a "[deleted]" placeholder */
  deleted: boolean;
};

/**
 * What comments and reactions hang off: an entry (its id), or one of its photos ("<entryId>/photos/<photoId>").
 * Firestore splits the path on "/", so the same functions serve both.
 */
export const subjectId = (entryId: string, photoId?: string) => (photoId ? `${entryId}/photos/${photoId}` : entryId);

const commentsRef = (ownerUid: string, entryId: string) =>
  collection(db, "users", ownerUid, "entries", entryId, "comments");
const commentRef = (ownerUid: string, entryId: string, commentId: string) =>
  doc(commentsRef(ownerUid, entryId), commentId);

/** "<entryId>" or "<entryId>/photos/<photoId>" back into its parts. */
const splitSubject = (subject: string) => {
  const [entryId, , photoId] = subject.split("/");
  return { entryId, photoId };
};

/** Who to tell about a comment: the title of the entry, and the author of the comment being replied to. */
export type CommentNote = { title: string; parentAuthorUid?: string };

export async function addComment(
  ownerUid: string, entryId: string, authorUid: string, text: string, parentId = "", media: Media = NO_MEDIA, note?: CommentNote,
) {
  takeTurn("comment");
  const ref = await addDoc(commentsRef(ownerUid, entryId), {
    authorUid, text, sticker: media.sticker, gif: media.gif, createdAt: serverTimestamp(), parentId, likes: [],
  });
  logActivity(authorUid, `${parentId ? "Replied to a comment on" : "Commented on"} ${note?.title ? `“${note.title}”` : "an entry"}`);
  if (note) {
    const { entryId: entry, photoId } = splitSubject(entryId);
    const fields = { ownerUid, entryId: entry, photoId, title: note.title };
    const reply = note.parentAuthorUid;
    // The entry's owner hears about every comment; whoever was replied to hears about the reply (once, not twice).
    if (ownerUid !== reply) await pushNote(ownerUid, authorUid, `comment_${ref.id}`, "comment", fields);
    if (reply) await pushNote(reply, authorUid, `reply_${ref.id}`, "reply", fields);
  }
  return ref;
}

/** `liked` is whether you like it now; the call flips it. Liking tells the comment's author. */
export async function setCommentLike(
  ownerUid: string, entryId: string, commentId: string, uid: string, liked: boolean, note?: { authorUid: string; title: string },
) {
  await updateDoc(commentRef(ownerUid, entryId, commentId), { likes: liked ? arrayRemove(uid) : arrayUnion(uid) });
  logActivity(uid, `${liked ? "Removed your like from a comment" : "Liked a comment"}${note?.title ? ` on “${note.title}”` : ""}`);
  if (!note) return;
  const key = `comment_like_${commentId}`;
  if (liked) await dropNote(note.authorUid, uid, key);
  else {
    const { entryId: entry, photoId } = splitSubject(entryId);
    await pushNote(note.authorUid, uid, key, "comment_like", { ownerUid, entryId: entry, photoId, title: note.title });
  }
}

/** Removes a comment, or blanks it to "[deleted]" when it has replies so the thread keeps its shape. */
export const removeComment = (ownerUid: string, entryId: string, commentId: string, hasReplies: boolean) =>
  hasReplies
    ? updateDoc(commentRef(ownerUid, entryId, commentId), { text: "", sticker: "", gif: "", deleted: true })
    : deleteDoc(commentRef(ownerUid, entryId, commentId));

/** Live comments on one entry, oldest first. null while loading. Comments written before replies existed are top-level. */
export function useComments(ownerUid: string, entryId: string) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState("");
  useEffect(
    () => onSnapshot(
      query(commentsRef(ownerUid, entryId), orderBy("createdAt")),
      (snap) => {
        setComments(snap.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id, authorUid: x.authorUid, text: x.text ?? "", sticker: x.sticker ?? "", gif: x.gif ?? "", createdAt: x.createdAt ?? null,
            parentId: x.parentId ?? "", likes: x.likes ?? [], deleted: x.deleted === true,
          } as Comment;
        }));
        setError("");
      },
      () => setError("Could not load comments. Check your connection."),
    ),
    [ownerUid, entryId],
  );
  return { comments, error };
}

/** Live number of comments and replies on one entry (deleted placeholders do not count). null while loading or if it cannot be read. */
export function useCommentCount(ownerUid: string, entryId: string): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(
    () => onSnapshot(
      commentsRef(ownerUid, entryId),
      (snap) => setCount(snap.docs.filter((d) => d.data().deleted !== true).length),
      () => setCount(null),
    ),
    [ownerUid, entryId],
  );
  return count;
}
