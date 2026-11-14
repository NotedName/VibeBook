import type { ReactNode } from "react";

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
            <Dot size={96} />
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
