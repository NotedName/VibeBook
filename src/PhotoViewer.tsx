import { useEffect, useRef, useState } from "react";
import type { Photo } from "./entries";
import { subjectId, useComments } from "./commentStore";
import Comments from "./Comments";
import CommentThread from "./CommentThread";
import ReactionBar from "./ReactionBar";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, CommentIcon } from "./icons";

type Props = {
  ownerUid: string;
  entryId: string;
  title: string;
  photos: Photo[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** Signed-in viewer. Leave out for the read-only view on shared links. */
  myUid?: string;
  onError?: (message: string) => void;
  /** Called when a signed-out viewer tries to react. */
  onLocked?: () => void;
};

/** Signed-out visitors can read a photo's comments but not write them. */
function ReadOnlyComments({ ownerUid, entryId, photoId }: { ownerUid: string; entryId: string; photoId: string }) {
  const { comments, error } = useComments(ownerUid, subjectId(entryId, photoId));
  return (
    <section className="comments" aria-label="Photo comments">
      {error && <p className="error">{error}</p>}
      {comments?.length === 0 && <p className="hint">No comments on this photo yet. Sign in or join to add one.</p>}
      {comments && comments.length > 0 && <CommentThread comments={comments} />}
    </section>
  );
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

/**
 * Full-screen view of an entry's photos. Next and previous (buttons, arrow keys or a swipe) move
 * through the entry's photos, and each photo has its own reactions and comments.
 */
export default function PhotoViewer({ ownerUid, entryId, title, photos, index, onIndex, onClose, myUid, onError, onLocked }: Props) {
  const [showComments, setShowComments] = useState(false);
  const [locked, setLocked] = useState(false);
  const touchX = useRef<number | null>(null);
  const last = photos.length - 1;
  const at = Math.min(index, last);
  const photo = photos[at];
  const go = (i: number) => { if (i >= 0 && i <= last) onIndex(i); };

  // Latest values for the key handler, so it is attached once.
  const live = useRef({ at, last, onIndex, onClose });
  live.current = { at, last, onIndex, onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { at, last, onIndex, onClose } = live.current;
      if (e.key === "Escape") onClose();
      else if (typing(e.target)) return;
      else if (e.key === "ArrowRight" && at < last) onIndex(at + 1);
      else if (e.key === "ArrowLeft" && at > 0) onIndex(at - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!photo) return null;
  return (
    <div className="overlay lightbox viewer" role="dialog" aria-modal="true" aria-label={`${title}: photo ${at + 1} of ${photos.length}`}>
      <div className="viewer-stage"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          const from = touchX.current;
          touchX.current = null;
          if (from === null) return;
          const dx = e.changedTouches[0].clientX - from;
          if (Math.abs(dx) > 50) go(at + (dx < 0 ? 1 : -1));
        }}>
        <img key={photo.id} src={photo.data} alt={`${title} photo ${at + 1} of ${photos.length}`} draggable={false} />
        <button type="button" className="icon-btn close" aria-label="Close photo" onClick={onClose}><CloseIcon /></button>
        {photos.length > 1 && (
          <>
            <button type="button" className="icon-btn viewer-nav prev" aria-label="Previous photo" disabled={at === 0}
              onClick={() => go(at - 1)}><ChevronLeftIcon /></button>
            <button type="button" className="icon-btn viewer-nav next" aria-label="Next photo" disabled={at === last}
              onClick={() => go(at + 1)}><ChevronRightIcon /></button>
            <span className="viewer-count" aria-hidden="true">{at + 1} / {photos.length}</span>
          </>
        )}
      </div>

      <div className="viewer-foot">
        <div className="post-actions">
          <ReactionBar key={photo.id} ownerUid={ownerUid} entryId={entryId} photoId={photo.id}
            title={myUid ? title : undefined} myUid={myUid} onError={onError} onLocked={() => { setLocked(true); onLocked?.(); }} />
          <button type="button" className={`act${showComments ? " on" : ""}`} aria-expanded={showComments}
            onClick={() => setShowComments(!showComments)}><CommentIcon /><span>Comment</span></button>
        </div>
        {!myUid && locked && <p className="locked-hint" role="status">Sign in or join to react and comment.</p>}
        {showComments && (myUid
          ? <Comments key={photo.id} ownerUid={ownerUid} entryId={entryId} photoId={photo.id} title={title} />
          : <ReadOnlyComments key={photo.id} ownerUid={ownerUid} entryId={entryId} photoId={photo.id} />)}
      </div>
    </div>
  );
}
