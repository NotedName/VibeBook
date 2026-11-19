import { useProfile } from "./session";
import { ShareIcon } from "./icons";

/** A shared entry inside a chat: who it is from, its title, and a button that opens it. Anyone who may not see it gets the usual "not available" page. */
export default function SharedEntryCard({ uid, id, title }: { uid: string; id: string; title: string }) {
  const owner = useProfile(uid);
  const who = owner === undefined ? "" : owner?.displayName ? `${owner.displayName}'s entry` : "A shared entry";
  return (
    <a className="shared-entry" href={`#/p/${encodeURIComponent(uid)}/${encodeURIComponent(id)}`} aria-label={`Open the entry “${title}”${who ? ` by ${who}` : ""}`}>
      <span className="se-head"><ShareIcon />{who || "Shared entry"}</span>
      <span className="se-title">{title}</span>
      <span className="se-open">View entry</span>
    </a>
  );
}
