import { useEffect, useState, type FormEvent } from "react";
import type { Timestamp } from "firebase/firestore";
import { addComment, COMMENT_MAX, deleteComment, useComments, type Comment } from "./comments";
import { useProfile, useSession } from "./session";
import Avatar from "./Avatar";
import { SendIcon, TrashIcon } from "./icons";

const stamp = (t: Timestamp | null) =>
  t ? t.toDate().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Sending…";

function CommentRow({ comment, ownerUid, entryId }: { comment: Comment; ownerUid: string; entryId: string }) {
  const s = useSession();
  const author = useProfile(comment.authorUid);
  const [armed, setArmed] = useState(false);
  const mine = comment.authorUid === s.uid;
  const name = author?.displayName || (author === undefined ? "…" : "VibeBook member");

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <li className="comment">
      <Avatar profile={author} />
      <div className="comment-main">
        <div className="comment-bubble">
          {mine ? <b>{name}</b> : <a className="post-name" href={`#/u/${encodeURIComponent(comment.authorUid)}`}>{name}</a>}
          <p>{comment.text}</p>
        </div>
        <div className="comment-meta">
          <time>{stamp(comment.createdAt)}</time>
          {(mine || ownerUid === s.uid) && (
            <button type="button" className={`link-act${armed ? " armed" : ""}`}
              onClick={() => {
                if (armed) deleteComment(ownerUid, entryId, comment.id).catch(() => s.notify("Could not delete comment"));
                else setArmed(true);
              }}>
              <TrashIcon />{armed ? "Tap to confirm" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Comment thread under an entry. Anyone who can see the entry can read and add comments. */
export default function Comments({ ownerUid, entryId }: { ownerUid: string; entryId: string }) {
  const s = useSession();
  const { comments, error } = useComments(ownerUid, entryId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    setBusy(true);
    try {
      await addComment(ownerUid, entryId, s.uid, clean);
      setText("");
    } catch {
      s.notify("Could not post your comment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="comments" aria-label="Comments">
      {error && <p className="error">{error}</p>}
      {comments === null && !error && <p className="hint">Loading comments…</p>}
      {comments?.length === 0 && <p className="hint">No comments yet. Start the conversation.</p>}
      {comments && comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((c) => <CommentRow key={c.id} comment={c} ownerUid={ownerUid} entryId={entryId} />)}
        </ul>
      )}
      <form className="comment-form" onSubmit={submit}>
        <Avatar profile={s.me} />
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={COMMENT_MAX}
          placeholder="Write a comment…" aria-label="Write a comment" />
        <button type="submit" className="icon-btn send" disabled={busy || !text.trim()} aria-label="Post comment">
          <SendIcon />
        </button>
      </form>
    </section>
  );
}
