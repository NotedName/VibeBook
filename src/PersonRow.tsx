import type { ReactNode } from "react";
import { useProfile } from "./session";
import Avatar from "./Avatar";
import RelationButtons from "./RelationButtons";
import { NameSkeleton } from "./Skeleton";

/** A person in a list. `badge` sits beside their name, e.g. their role in a group. */
export default function PersonRow({ uid, badge }: { uid: string; badge?: ReactNode }) {
  const p = useProfile(uid);
  return (
    <li className="person">
      <a href={`#/u/${encodeURIComponent(uid)}`} className="person-link">
        <Avatar profile={p} size="md" />
        <span className="person-text">
          <b>{p === undefined ? <NameSkeleton /> : p?.displayName || "VibeBook member"}{badge}</b>
          {p?.headline && <span>{p.headline}</span>}
        </span>
      </a>
      <RelationButtons uid={uid} />
    </li>
  );
}
