import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Timestamp } from "firebase/firestore";
import { COMMENT_MAX, MAX_DEPTH, type Comment } from "./commentStore";
import { fetchProfile } from "./profiles";
import type { Profile } from "./types";
import Avatar from "./Avatar";
import { CommentIcon, MoreIcon, SendIcon, SmileIcon, ThumbUpIcon, TrashIcon } from "./icons";
import MediaPicker, { MediaPreview } from "./MediaPicker";
import { NO_MEDIA, type Media } from "./stickers";

const stamp = (t: Timestamp | null) =>
  t ? t.toDate().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Sending…";

/** What a signed-in viewer can do. Leave it out for the read-only view on shared links. */
export type CommentActions = {
  myUid: string;
  /** owner of the entry, who can delete any comment */
  ownerUid: string;
  like: (comment: Comment, liked: boolean) => void;
  /** resolves true when the reply was posted */
  reply: (parent: Comment, text: string, media: Media) => Promise<boolean>;
  remove: (comment: Comment, hasReplies: boolean) => void;
};

type ThreadNode = { comment: Comment; kids: ThreadNode[] };

/** Groups a flat, oldest-first list into threads. A reply whose parent is missing is shown at the top level. */
function buildTree(list: Comment[]): ThreadNode[] {
  const nodes = new Map(list.map((c) => [c.id, { comment: c, kids: [] as ThreadNode[] }]));
  const roots: ThreadNode[] = [];
  nodes.forEach((n) => (nodes.get(n.comment.parentId)?.kids ?? roots).push(n));
  return roots;
}

const countReplies = (n: ThreadNode): number => n.kids.reduce((sum, k) => sum + 1 + countReplies(k), 0);

function useAuthor(uid: string) {
  const [p, setP] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetchProfile(uid).then((x) => live && setP(x), () => live && setP(null));
    return () => { live = false; };
  }, [uid]);
  return p;
}

/** Three-dot menu at the top right of a comment. Deleting takes a second tap to confirm. */
function CommentMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setArmed(false); };
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <div className="post-menu comment-menu" ref={ref}>
      <button type="button" className="icon-btn menu-btn" aria-label="Comment actions" aria-haspopup="menu"
        aria-expanded={open} onClick={() => { setOpen(!open); setArmed(false); }}><MoreIcon /></button>
      {open && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" className={`danger${armed ? " armed" : ""}`}
            onClick={() => { if (armed) { setOpen(false); onDelete(); } else setArmed(true); }}>
            <TrashIcon />{armed ? "Tap to confirm" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}

function ReplyForm({ onSubmit, onCancel }: { onSubmit: (text: string, media: Media) => Promise<boolean>; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<Media>(NO_MEDIA);
  const [picking, setPicking] = useState(false);
  const hasMedia = !!(media.sticker || media.gif);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean && !hasMedia) return;
    setBusy(true);
    if (await onSubmit(clean, media)) onCancel();
    else setBusy(false);
  }

  return (
    <form className="comment-form reply-form" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={COMMENT_MAX} autoFocus
        placeholder="Write a reply…" aria-label="Write a reply" />
      <button type="button" className={`icon-btn${picking ? " on" : ""}`} aria-label="Add a sticker or GIF"
        aria-expanded={picking} onClick={() => setPicking(!picking)}><SmileIcon /></button>
      <button type="submit" className="icon-btn send" disabled={busy || (!text.trim() && !hasMedia)} aria-label="Post reply"><SendIcon /></button>
      <button type="button" className="link-act" onClick={onCancel}>Cancel</button>
      {hasMedia && <MediaPreview media={media} onRemove={() => setMedia(NO_MEDIA)} />}
      {picking && <MediaPicker onPick={(m) => { setMedia(m); setPicking(false); }} />}
    </form>
  );
}

type NodeProps = {
  node: ThreadNode;
  depth: number;
  actions?: CommentActions;
  replyTo: string | null;
  setReplyTo: (id: string | null) => void;
};

function CommentNode({ node, depth, actions, replyTo, setReplyTo }: NodeProps) {
  const { comment: c, kids } = node;
  const author = useAuthor(c.authorUid);
  const [open, setOpen] = useState(true);
  const mine = actions?.myUid === c.authorUid;
  const liked = !!actions && c.likes.includes(actions.myUid);
  const canDelete = !!actions && !c.deleted && (mine || actions.ownerUid === actions.myUid);
  const canReply = !!actions && !c.deleted && depth < MAX_DEPTH;
  const replies = countReplies(node);
  const name = author?.displayName || (author === undefined ? "…" : "VibeBook member");

  return (
    <li className="comment">
      <div className="comment-head">
        {c.deleted ? <span className="comment-deleted">[deleted]</span> : (
          <>
            <Avatar profile={author} />
            {actions && !mine
              ? <a className="post-name" href={`#/u/${encodeURIComponent(c.authorUid)}`}>{name}</a>
              : <b>{name}</b>}
            <time>{stamp(c.createdAt)}</time>
            {canDelete && <CommentMenu onDelete={() => actions.remove(c, kids.length > 0)} />}
          </>
        )}
      </div>
      {!c.deleted && c.text && <p className="comment-text">{c.text}</p>}
      {!c.deleted && c.sticker && <p className="comment-sticker" role="img" aria-label={`Sticker ${c.sticker}`}>{c.sticker}</p>}
      {!c.deleted && c.gif && <img className="comment-gif" src={c.gif} alt="GIF" loading="lazy" referrerPolicy="no-referrer" />}

      <div className="comment-meta">
        {!c.deleted && (actions ? (
          <button type="button" className={`link-act${liked ? " on" : ""}`} aria-pressed={liked}
            onClick={() => actions.like(c, liked)}>
            <ThumbUpIcon filled={liked} />{c.likes.length > 0 ? c.likes.length : "Like"}
          </button>
        ) : c.likes.length > 0 && <span className="link-act static"><ThumbUpIcon />{c.likes.length}</span>)}
        {canReply && (
          <button type="button" className="link-act" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>
            <CommentIcon />Reply
          </button>
        )}
        {kids.length > 0 && (
          <button type="button" className="link-act" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Hide replies" : `Show ${replies} ${replies === 1 ? "reply" : "replies"}`}
          </button>
        )}
      </div>

      {actions && replyTo === c.id && (
        <ReplyForm onSubmit={(text, media) => actions.reply(c, text, media)} onCancel={() => setReplyTo(null)} />
      )}

      {kids.length > 0 && open && (
        <ul className="comment-list replies">
          {kids.map((k) => (
            <CommentNode key={k.comment.id} node={k} depth={depth + 1} actions={actions} replyTo={replyTo} setReplyTo={setReplyTo} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Reddit-style comment threads: replies nest under their parent, with likes on every comment. */
export default function CommentThread({ comments, actions }: { comments: Comment[]; actions?: CommentActions }) {
  const tree = useMemo(() => buildTree(comments), [comments]);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  return (
    <ul className="comment-list">
      {tree.map((n) => (
        <CommentNode key={n.comment.id} node={n} depth={1} actions={actions} replyTo={replyTo} setReplyTo={setReplyTo} />
      ))}
    </ul>
  );
}
