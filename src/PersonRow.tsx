import { useProfile } from "./session";
import Avatar from "./Avatar";
import RelationButtons from "./RelationButtons";

export default function PersonRow({ uid }: { uid: string }) {
  const p = useProfile(uid);
  return (
    <li className="person">
      <a href={`#/u/${encodeURIComponent(uid)}`} className="person-link">
        <Avatar profile={p} size="md" />
        <span className="person-text">
          <b>{p === undefined ? "Loading…" : p?.displayName || "VibeBook member"}</b>
          {p?.headline && <span>{p.headline}</span>}
        </span>
      </a>
      <RelationButtons uid={uid} />
    </li>
  );
}
