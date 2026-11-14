import { useEffect, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export const COMMENT_MAX = 500;

export type Comment = { id: string; authorUid: string; text: string; createdAt: Timestamp | null };

const commentsRef = (ownerUid: string, entryId: string) =>
  collection(db, "users", ownerUid, "entries", entryId, "comments");

export const addComment = (ownerUid: string, entryId: string, authorUid: string, text: string) =>
  addDoc(commentsRef(ownerUid, entryId), { authorUid, text, createdAt: serverTimestamp() });

export const deleteComment = (ownerUid: string, entryId: string, commentId: string) =>
  deleteDoc(doc(commentsRef(ownerUid, entryId), commentId));

/** Live comments on one entry, oldest first. null while loading. */
export function useComments(ownerUid: string, entryId: string) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState("");
  useEffect(
    () => onSnapshot(
      query(commentsRef(ownerUid, entryId), orderBy("createdAt")),
      (snap) => {
        setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Comment));
        setError("");
      },
      () => setError("Could not load comments. Check your connection."),
    ),
    [ownerUid, entryId],
  );
  return { comments, error };
}
