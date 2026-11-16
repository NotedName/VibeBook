import type { ReactNode } from "react";
import { useProfile } from "./session";
import { usePresence } from "./activeStatus";
import { personHash } from "./profiles";
import Avatar from "./Avatar";
import RelationButtons from "./RelationButtons";
import { NameSkeleton } from "./Skeleton";

/** A person in a list. `badge` sits beside their name, e.g. their role in a group. */
export default function PersonRow({ uid, badge }: { uid: string; badge?: ReactNode }) {
  const p = useProfile(uid);
  const presence = usePresence(uid);
  return (
    <li className="person">
      <a href={personHash(uid, p)} className="person-link">
        <Avatar profile={p} size="md" active={presence.status === "active"} />
        <span className="person-text">
          <b>{p === undefined ? <NameSkeleton /> : p?.displayName || "VibeBook member"}{badge}</b>
          {p?.username && <span>@{p.username}</span>}
          {p?.headline && <span>{p.headline}</span>}
        </span>
      </a>
      <RelationButtons uid={uid} />
    </li>
  );
}
