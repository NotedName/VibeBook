import { useMemo, useState, type FormEvent } from "react";
import { addComment, COMMENT_MAX, removeComment, setCommentLike, useComments } from "./commentStore";
import { useSession } from "./session";
import Avatar from "./Avatar";
import CommentThread, { type CommentActions } from "./CommentThread";
import { SendIcon } from "./icons";

/** Comment thread under an entry. Anyone who can see the entry can read, like and reply to comments. */
export default function Comments({ ownerUid, entryId }: { ownerUid: string; entryId: string }) {
  const { uid, me, notify } = useSession();
  const { comments, error } = useComments(ownerUid, entryId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const actions = useMemo<CommentActions>(() => ({
    myUid: uid,
    ownerUid,
    like: (c, liked) => { setCommentLike(ownerUid, entryId, c.id, uid, liked).catch(() => notify("Could not save your like")); },
    reply: (parent, reply) =>
      addComment(ownerUid, entryId, uid, reply, parent.id).then(() => true, () => { notify("Could not post your reply"); return false; }),
    remove: (c, hasReplies) => { removeComment(ownerUid, entryId, c.id, hasReplies).catch(() => notify("Could not delete comment")); },
  }), [uid, ownerUid, entryId, notify]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    setBusy(true);
    try {
      await addComment(ownerUid, entryId, uid, clean);
      setText("");
    } catch {
      notify("Could not post your comment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="comments" aria-label="Comments">
      {error && <p className="error">{error}</p>}
      {comments === null && !error && <p className="hint">Loading comments…</p>}
      {comments?.length === 0 && <p className="hint">No comments yet. Start the conversation.</p>}
      {comments && comments.length > 0 && <CommentThread comments={comments} actions={actions} />}
      <form className="comment-form" onSubmit={submit}>
        <Avatar profile={me} />
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={COMMENT_MAX}
          placeholder="Write a comment…" aria-label="Write a comment" />
        <button type="submit" className="icon-btn send" disabled={busy || !text.trim()} aria-label="Post comment">
          <SendIcon />
        </button>
      </form>
    </section>
  );
}
