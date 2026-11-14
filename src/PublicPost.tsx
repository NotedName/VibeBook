import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { loadPhotos, type Entry } from "./entries";
import { useComments } from "./commentStore";
import { fetchProfile } from "./profiles";
import { clockTime, copyText, longDay } from "./report";
import { postLink } from "./share";
import type { Profile } from "./types";
import Avatar from "./Avatar";
import ReactionBar from "./ReactionBar";
import VideoPlayer from "./VideoPlayer";
import { ShareIcon } from "./icons";

type Props = { uid: string; id: string; onAuth: (mode: "signin" | "signup") => void };

const stamp = (t: Timestamp | null) =>
  t ? t.toDate().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

function useOtherProfile(uid: string) {
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetchProfile(uid).then((x) => live && setP(x), () => live && setP(null));
    return () => { live = false; };
  }, [uid]);
  return p;
}

function CommentLine({ authorUid, text, at }: { authorUid: string; text: string; at: Timestamp | null }) {
  const author = useOtherProfile(authorUid);
  return (
    <li className="comment">
      <Avatar profile={author} />
      <div className="comment-main">
        <div className="comment-bubble">
          <b>{author?.displayName || (author === undefined ? "…" : "VibeBook member")}</b>
          <p>{text}</p>
        </div>
        <div className="comment-meta"><time>{stamp(at)}</time></div>
      </div>
    </li>
  );
}

/**
 * What a signed-out visitor sees at a share link: the entry, its photos, video, reaction counts
 * and comments, all read-only. Reacting, commenting and everything else needs an account.
 */
export default function PublicPost({ uid, id, onAuth }: Props) {
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);
  const [photos, setPhotos] = useState<string[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [lockedHint, setLockedHint] = useState(false);
  const [copied, setCopied] = useState(false);
  const owner = useOtherProfile(uid);
  const { comments } = useComments(uid, id);

  useEffect(() => {
    let live = true;
    getDoc(doc(db, "users", uid, "entries", id)).then(
      (snap) => {
        if (!live) return;
        const data = snap.exists() ? ({ id: snap.id, ownerUid: uid, ...snap.data() } as Entry) : null;
        setEntry(data && data.visibility === "public" ? data : null);
      },
      () => live && setEntry(null),
    );
    return () => { live = false; };
  }, [uid, id]);

  useEffect(() => {
    if (!entry || entry.photoCount === 0) return;
    let live = true;
    loadPhotos(uid, id).then((p) => live && setPhotos(p.map((x) => x.data)), () => {});
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
    <>
      <header className="topbar">
        <div className="topbar-in">
          <span className="brand"><span className="brand-mark" aria-hidden="true">V</span>VibeBook</span>
          <div className="top-actions">
            <button type="button" className="btn small" onClick={() => onAuth("signin")}>Sign in</button>
            <button type="button" className="btn small primary" onClick={() => onAuth("signup")}>Join</button>
          </div>
        </div>
      </header>

      <main className="logbook">
        {entry === undefined && <p className="note">Loading…</p>}
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
              {entry.description && <p className="post-desc">{entry.description}</p>}
              {entry.skills.length > 0 && <ul className="chips">{entry.skills.map((sk) => <li key={sk}>{sk}</li>)}</ul>}
            </div>

            {photos.length > 0 && (
              <div className={`photo-grid ${photos.length % 2 ? "odd" : "even"}`}>
                {photos.map((src, i) => (
                  <button key={i} type="button" className="photo-btn" onClick={() => setZoom(src)}
                    aria-label={`Open photo ${i + 1} of ${entry.title}`}>
                    <img src={src} alt={`${entry.title} photo ${i + 1}`} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            {entry.videoUrl && <VideoPlayer url={entry.videoUrl} title={entry.title} />}

            <ReactionBar ownerUid={uid} entryId={id} onLocked={() => setLockedHint(true)} />
            {lockedHint && <p className="locked-hint" role="status">Sign in or join to react and comment.</p>}

            <div className="post-actions">
              <button type="button" className="act" onClick={copyLink}>
                <ShareIcon /><span>{copied ? "Link copied" : "Share"}</span>
              </button>
            </div>

            {comments && comments.length > 0 && (
              <section className="comments" aria-label="Comments">
                <ul className="comment-list">
                  {comments.map((c) => <CommentLine key={c.id} authorUid={c.authorUid} text={c.text} at={c.createdAt} />)}
                </ul>
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

      {zoom && (
        <div className="overlay lightbox" onClick={() => setZoom(null)}>
          <img src={zoom} alt={entry?.title ?? ""} />
        </div>
      )}
    </>
  );
}
