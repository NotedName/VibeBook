import { useProfile } from "./session";
import { personHash } from "./profiles";
import { useGroup } from "./groups";
import { clockTime, longDay } from "./report";
import type { Entry } from "./entries";
import Avatar from "./Avatar";
import { GroupAvatar } from "./GroupRow";
import { LockIcon, RepostIcon } from "./icons";

/**
 * What stands in for a post shared to a private group when you are not in that group: who and when, and a way to
 * the group, but nothing of the entry itself.
 */
export default function LockedPost({ entry }: { entry: Entry }) {
  const owner = useProfile(entry.ownerUid);
  const reposter = useProfile(entry.repostedBy);
  const group = useGroup(entry.lockedGroupId ?? "");
  const name = owner?.displayName || (owner === undefined ? "…" : "VibeBook member");
  const groupName = group ? group.name : group === undefined ? "…" : "the group";
  const href = `#/g/${encodeURIComponent(entry.lockedGroupId ?? "")}`;
  return (
    <article className="post locked-post">
      {entry.repostedBy && (
        <p className="repost-note"><RepostIcon />
          <a href={personHash(entry.repostedBy, reposter)}><b>{reposter?.displayName || "Someone"}</b></a> reposted
        </p>
      )}
      <header className="post-head">
        <a href={personHash(entry.ownerUid ?? "", owner)} aria-label={`${name}'s profile`}><Avatar profile={owner} /></a>
        <div className="post-who">
          <a className="post-name" href={personHash(entry.ownerUid ?? "", owner)}>{name}</a>
          <time>{longDay(entry.date)} · {clockTime(entry.time)}</time>
        </div>
      </header>
      <div className="locked-body">
        <span className="locked-icon" aria-hidden="true"><LockIcon /></span>
        <div className="locked-text">
          <b>Posted in a private group</b>
          <span>Join {groupName} to see this post.</span>
        </div>
        {group && <a className="btn small primary" href={href}><GroupAvatar name={group.name} photo={group.avatar} size="sm" />View group</a>}
      </div>
    </article>
  );
}
