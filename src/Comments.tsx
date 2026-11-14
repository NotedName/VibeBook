import { logActivity } from "./activity";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { addComment, COMMENT_MAX, removeComment, setCommentLike, subjectId, useComments } from "./commentStore";
import { useSession } from "./session";
import Avatar from "./Avatar";
import CommentThread, { type CommentActions } from "./CommentThread";
import { SendIcon, SmileIcon } from "./icons";
import MediaPicker, { MediaPreview } from "./MediaPicker";
import { NO_MEDIA, type Media } from "./stickers";
import { insertEmoji } from "./emoji";
import { LinesSkeleton } from "./Skeleton";

/**
 * Comment thread under an entry, or under one of its photos when photoId is given. Anyone who can see
 * the entry can read, like and reply to comments.
 */
export default function Comments({ ownerUid, entryId: entry, photoId, title }: { ownerUid: string; entryId: string; photoId?: string; title?: string }) {
  const entryId = subjectId(entry, photoId);
  const { uid, me, notify } = useSession();
  const { comments, error } = useComments(ownerUid, entryId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<Media>(NO_MEDIA);
  const [picking, setPicking] = useState(false);
  const [revealAll, setRevealAll] = useState(0);
  const hasMedia = !!(media.sticker || media.gif);
  const input = useRef<HTMLInputElement>(null);

  const actions = useMemo<CommentActions>(() => ({
    myUid: uid,
    ownerUid,
    like: (c, liked) => { setCommentLike(ownerUid, entryId, c.id, uid, liked, title === undefined ? undefined : { authorUid: c.authorUid, title }).catch(() => notify("Could not save your like")); },
    reply: (parent, reply, media) =>
      addComment(ownerUid, entryId, uid, reply, parent.id, media, title === undefined ? undefined : { title, parentAuthorUid: parent.authorUid }).then(() => true, () => { notify("Could not post your reply"); return false; }),
    remove: (c, hasReplies) => {
      removeComment(ownerUid, entryId, c.id, hasReplies)
        .then(() => logActivity(uid, `Deleted a comment${title ? ` on “${title}”` : ""}`), () => notify("Could not delete comment"));
    },
  }), [uid, ownerUid, entryId, title, notify]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean && !hasMedia) return;
    setBusy(true);
    try {
      await addComment(ownerUid, entryId, uid, clean, "", media, title === undefined ? undefined : { title });
      setText("");
      setMedia(NO_MEDIA);
      setPicking(false);
      setRevealAll((n) => n + 1);
    } catch {
      notify("Could not post your comment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="comments" aria-label="Comments">
      {error && <p className="error">{error}</p>}
      {comments === null && !error && <LinesSkeleton label="Loading comments" />}
      {comments?.length === 0 && <p className="hint">No comments yet. Start the conversation.</p>}
      {comments && comments.length > 0 && <CommentThread comments={comments} actions={actions} showAllSignal={revealAll} />}
      <form className="comment-form" onSubmit={submit}>
        <Avatar profile={me} />
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={COMMENT_MAX}
          placeholder="Write a comment…" aria-label="Write a comment" />
        <button type="button" className={`icon-btn${picking ? " on" : ""}`} aria-label="Add an emoji, sticker or GIF"
          aria-expanded={picking} onClick={() => setPicking(!picking)}><SmileIcon /></button>
        <button type="submit" className="icon-btn send" disabled={busy || (!text.trim() && !hasMedia)} aria-label="Post comment">
          <SendIcon />
        </button>
        {hasMedia && <MediaPreview media={media} onRemove={() => setMedia(NO_MEDIA)} />}
        {picking && (
          <MediaPicker onPick={(m) => { setMedia(m); setPicking(false); }}
            onEmoji={(e) => insertEmoji(input.current, text, e, setText, COMMENT_MAX)} />
        )}
      </form>
    </section>
  );
}
