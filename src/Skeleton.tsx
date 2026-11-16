import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

/**
 * Grey placeholder shapes shown while something loads. They only appear after a short delay
 * (see .sk-region in styles.css), so quick loads never flash them.
 */
function Region({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sk-region" role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  );
}

const Bar = ({ w = "100%", h = 12 }: { w?: string; h?: number }) => (
  <span className="sk" aria-hidden="true" style={{ width: w, height: h }} />
);
const Dot = ({ size, radius = "50%" }: { size: number; radius?: string }) => (
  <span className="sk sk-dot" aria-hidden="true" style={{ width: size, height: size, borderRadius: radius }} />
);

function PostShape({ photo }: { photo: boolean }) {
  return (
    <article className="post sk-post" aria-hidden="true">
      <div className="post-head">
        <Dot size={40} />
        <div className="sk-stack"><Bar w="40%" /><Bar w="28%" h={10} /></div>
      </div>
      <div className="post-body sk-stack">
        <Bar w="70%" h={16} />
        <Bar />
        <Bar w="85%" />
      </div>
      {photo && <span className="sk sk-photo" />}
    </article>
  );
}

/** Stand-in for a list of entries. */
export function FeedSkeleton({ count = 2 }: { count?: number }) {
  return (
    <Region label="Loading entries">
      {Array.from({ length: count }, (_, i) => <PostShape key={i} photo={i === 0} />)}
    </Region>
  );
}

/** Stand-in for a list of people or groups. */
export function RowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Region label="Loading">
      <ul className="people" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="person">
            <div className="person-link"><Dot size={48} /><div className="sk-stack" style={{ flex: 1 }}><Bar w="45%" /><Bar w="30%" h={10} /></div></div>
          </li>
        ))}
      </ul>
    </Region>
  );
}

/** Stand-in for a profile card: cover, photo, name and stats. */
export function ProfileSkeleton() {
  return (
    <Region label="Loading profile">
      <section className="profile" aria-hidden="true">
        <div className="cover-wrap"><span className="sk sk-cover" /></div>
        <div className="pad">
          <div className="who">
            <Dot size={128} />
            <div className="who-text sk-stack"><Bar w="50%" h={20} /><Bar w="35%" /></div>
          </div>
          <div className="stats">{[0, 1, 2, 3].map((i) => <span key={i} className="sk" style={{ height: 58, borderRadius: 12 }} />)}</div>
        </div>
      </section>
    </Region>
  );
}

/** Stand-in for a group's header card. */
export function GroupHeadSkeleton() {
  return (
    <Region label="Loading group">
      <section className="group-head" aria-hidden="true">
        <Dot size={72} radius="16px" />
        <div className="group-head-text"><Bar w="45%" h={20} /><Bar w="70%" /></div>
      </section>
    </Region>
  );
}

/** A few lines of text, for small spots such as a comment thread. */
export function LinesSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <Region label={label}>
      <div className="sk-stack" aria-hidden="true"><Bar w="60%" /><Bar w="85%" /></div>
    </Region>
  );
}

/** A short bar for a name that has not arrived yet. */
export const NameSkeleton = () => <Bar w="7em" />;

/** Stand-in for the hours card (own or someone else's). */
export function HoursSkeleton() {
  return (
    <Region label="Loading hours">
      <section className="hours" aria-hidden="true">
        <Bar w="38%" h={26} />
        <Bar w="55%" h={10} />
        <span className="sk" style={{ height: 10, borderRadius: 999 }} />
      </section>
    </Region>
  );
}

/** A picture-shaped block, for a photo that is still being prepared. */
export function BlockSkeleton({ label = "Loading", ratio = "4 / 3" }: { label?: string; ratio?: string }) {
  return (
    <Region label={label}>
      <span className="sk" aria-hidden="true" style={{ width: "100%", aspectRatio: ratio, borderRadius: 12 }} />
    </Region>
  );
}

/** Stand-in for a few form fields that are still loading. */
export function FieldsSkeleton({ count = 3, label = "Loading" }: { count?: number; label?: string }) {
  return (
    <Region label={label}>
      <div className="sk-stack" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => <span key={i} className="sk" style={{ height: 40, borderRadius: 12 }} />)}
      </div>
    </Region>
  );
}

/** Stand-in for a row of small thumbnails (photos on their way). */
export function ThumbsSkeleton({ count }: { count: number }) {
  return (
    <Region label="Loading photos">
      <div className="thumbs" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => <span key={i} className="sk" style={{ width: 88, height: 88, borderRadius: 16 }} />)}
      </div>
    </Region>
  );
}

/** Stand-in for a conversation: bubbles from both sides, in varied widths, with the other person's picture beside theirs. */
const BUBBLES: { mine: boolean; w: string; h?: number }[] = [
  { mine: false, w: "55%" }, { mine: false, w: "38%" }, { mine: true, w: "46%" }, { mine: false, w: "62%", h: 56 }, { mine: true, w: "30%" }, { mine: true, w: "52%" },
];
export function MessagesSkeleton({ count = BUBBLES.length, label = "Loading messages" }: { count?: number; label?: string }) {
  // the newest ones are at the bottom of a chat, so a short placeholder shows the last few
  const shown = BUBBLES.slice(BUBBLES.length - Math.min(count, BUBBLES.length));
  return (
    <Region label={label}>
      <div className="sk-chat" aria-hidden="true">
        {shown.map((b, i) => (
          <div key={i} className={`sk-msg ${b.mine ? "mine" : "theirs"}`}>
            {!b.mine && <Dot size={28} />}
            <span className="sk sk-bubble" style={{ width: b.w, height: b.h ?? 38 }} />
          </div>
        ))}
      </div>
    </Region>
  );
}

/** The message box while the encryption keys are still being checked. */
export function ComposerSkeleton({ label = "Checking your encryption keys" }: { label?: string }) {
  return (
    <Region label={label}>
      <div className="sk-composer" aria-hidden="true">
        <Dot size={32} /><Dot size={32} /><span className="sk sk-field" /><Dot size={32} />
      </div>
    </Region>
  );
}

/** A grid of GIF-shaped tiles while a search is on its way. */
export function GifGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Region label="Loading GIFs">
      <div className="gif-grid" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => <span key={i} className="sk" style={{ height: 96, borderRadius: 10 }} />)}
      </div>
    </Region>
  );
}

/**
 * A picture that comes from the internet (a GIF): it sits on a shimmering block of its own size until it has loaded, so the chat
 * does not jump when it arrives. If it never loads the block goes away and the alt text shows.
 */
export function LoadingImg({ className = "", style, onLoad, onError, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const [state, setState] = useState<"loading" | "done" | "failed">("loading");
  return (
    <img {...rest} className={`${className}${state === "loading" ? " sk sk-img" : ""}`} style={style}
      onLoad={(e) => { setState("done"); onLoad?.(e); }} onError={(e) => { setState("failed"); onError?.(e); }} />
  );
}
