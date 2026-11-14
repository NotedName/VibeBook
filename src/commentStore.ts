import { useEffect, useState } from "react";
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp,
  updateDoc, type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export const COMMENT_MAX = 500;
/** Levels of replies shown: a top-level comment is level 1. Comments on the last level cannot be replied to. */
export const MAX_DEPTH = 5;

export type Comment = {
  id: string;
  authorUid: string;
  text: string;
  createdAt: Timestamp | null;
  /** id of the comment this replies to, "" for a top-level comment */
  parentId: string;
  /** uids of people who liked it */
  likes: string[];
  /** a comment that had replies when it was deleted stays as a "[deleted]" placeholder */
  deleted: boolean;
};

const commentsRef = (ownerUid: string, entryId: string) =>
  collection(db, "users", ownerUid, "entries", entryId, "comments");
const commentRef = (ownerUid: string, entryId: string, commentId: string) =>
  doc(commentsRef(ownerUid, entryId), commentId);

export const addComment = (ownerUid: string, entryId: string, authorUid: string, text: string, parentId = "") =>
  addDoc(commentsRef(ownerUid, entryId), { authorUid, text, createdAt: serverTimestamp(), parentId, likes: [] });

export const setCommentLike = (ownerUid: string, entryId: string, commentId: string, uid: string, liked: boolean) =>
  updateDoc(commentRef(ownerUid, entryId, commentId), { likes: liked ? arrayRemove(uid) : arrayUnion(uid) });

/** Removes a comment, or blanks it to "[deleted]" when it has replies so the thread keeps its shape. */
export const removeComment = (ownerUid: string, entryId: string, commentId: string, hasReplies: boolean) =>
  hasReplies
    ? updateDoc(commentRef(ownerUid, entryId, commentId), { text: "", deleted: true })
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
            id: d.id, authorUid: x.authorUid, text: x.text ?? "", createdAt: x.createdAt ?? null,
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
