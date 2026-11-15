import { useEffect, useState } from "react";
import { FeedSkeleton } from "./Skeleton";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { loadPhotos, type Entry, type Photo } from "./entries";
import { useComments } from "./commentStore";
import { fetchProfile } from "./profiles";
import { clockTime, copyText, longDay } from "./report";
import { postLink } from "./share";
import type { Profile } from "./types";
import Avatar from "./Avatar";
import ReactionBar from "./ReactionBar";
import CommentThread from "./CommentThread";
import VideoPlayer from "./VideoPlayer";
import { CommentIcon, ShareIcon } from "./icons";
import PhotoViewer from "./PhotoViewer";
import { BrandName } from "./Logo";
import ClampedText from "./ClampedText";
import SkillChips from "./SkillChips";

type Props = { uid: string; id: string; onAuth: (mode: "signin" | "signup") => void };

function useOtherProfile(uid: string) {
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetchProfile(uid).then((x) => live && setP(x), () => live && setP(null));
    return () => { live = false; };
  }, [uid]);
  return p;
}

/**
 * What a signed-out visitor sees at a share link: the entry, its photos, video, reaction counts
 * and comments, all read-only. Reacting, commenting and everything else needs an account.
 */
export default function PublicPost({ uid, id, onAuth }: Props) {
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  const [lockedHint, setLockedHint] = useState(false);
  const [copied, setCopied] = useState(false);
  const owner = useOtherProfile(uid);
  const { comments } = useComments(uid, id);
  const commentTotal = (comments ?? []).filter((c) => !c.deleted).length;

  useEffect(() => {
    let live = true;
    getDoc(doc(db, "users", uid, "entries", id)).then(
      (snap) => {
        if (!live) return;
        const data = snap.exists() ? ({ id: snap.id, ownerUid: uid, ...snap.data() } as Entry) : null;
        setEntry(data && data.visibility === "public" && data.archived !== true ? data : null);
      },
      () => live && setEntry(null),
    );
    return () => { live = false; };
  }, [uid, id]);

  useEffect(() => {
    if (!entry || entry.photoCount === 0) return;
    let live = true;
    loadPhotos(uid, id).then((p) => live && setPhotos(p), () => {});
    return () => { live = false; };
  }, [entry, uid, id]);

  async function copyLink() {
    if (await copyText(postLink(uid, id))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const name = owner?.displayName || (owner === undefined ? "…" : "VibeBook member");

  return (
    <div className="public-page">
      <header className="public-bar">
        <div className="public-bar-in">
          <span className="public-brand"><BrandName /></span>
          <div className="public-actions">
            <button type="button" className="btn small" onClick={() => onAuth("signin")}>Sign in</button>
            <button type="button" className="btn small primary" onClick={() => onAuth("signup")}>Join</button>
          </div>
        </div>
      </header>

      <main className="public-main">
        {entry === undefined && <FeedSkeleton count={1} />}
        {entry === null && (
          <div className="empty">
            <h2>This entry is not available</h2>
            <p>It may have been deleted, or it is no longer public.</p>
            <button type="button" className="btn primary" onClick={() => onAuth("signin")}>Sign in</button>
          </div>
        )}

        {entry && (
          <article className="post">
            <header className="post-head">
              <Avatar profile={owner} />
              <div className="post-who">
                <b>{name}</b>
                <time>{longDay(entry.date)} · {clockTime(entry.time)}</time>
              </div>
            </header>
            <div className="post-body">
              <h2 className="post-title">{entry.title}</h2>
              {entry.description && <ClampedText className="post-desc" text={entry.description} />}
              <SkillChips skills={entry.skills} />
            </div>

            {photos.length > 0 && (
              <div className={`photo-grid ${photos.length % 2 ? "odd" : "even"}`}>
                {photos.map((p, i) => (
                  <button key={p.id} type="button" className="photo-btn" onClick={() => setViewing(i)}
                    aria-label={`Open photo ${i + 1} of ${entry.title}`}>
                    <img src={p.data} alt={`${entry.title} photo ${i + 1}`} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            {entry.gif && <img className="post-gif" src={entry.gif} alt={`GIF on ${entry.title}`} loading="lazy" referrerPolicy="no-referrer" />}
            {entry.videoUrl && <VideoPlayer url={entry.videoUrl} title={entry.title} />}

            <div className="post-actions">
              <ReactionBar ownerUid={uid} entryId={id} onLocked={() => setLockedHint(true)} />
              <span className="act static" title="Comments"><CommentIcon /><span>Comments</span>{commentTotal > 0 && <b className="count">{commentTotal}</b>}</span>
              <button type="button" className="act" onClick={copyLink}>
                <ShareIcon /><span>{copied ? "Link copied" : "Share"}</span>
              </button>
            </div>
            {lockedHint && <p className="locked-hint" role="status">Sign in or join to react and comment.</p>}

            {comments && comments.length > 0 && (
              <section className="comments" aria-label="Comments">
                <CommentThread comments={comments} />
              </section>
            )}

            <div className="join-cta">
              <p><b>Want to join the conversation?</b> Create a free account to react, comment and share your own entries.</p>
              <button type="button" className="btn primary" onClick={() => onAuth("signup")}>Create account</button>
              <button type="button" className="btn" onClick={() => onAuth("signin")}>Sign in</button>
            </div>
          </article>
        )}
      </main>

      {viewing !== null && entry && photos.length > 0 && (
        <PhotoViewer ownerUid={uid} entryId={id} title={entry.title} photos={photos}
          index={viewing} onIndex={setViewing} onClose={() => setViewing(null)}
          onLocked={() => setLockedHint(true)} />
      )}
    </div>
  );
}
