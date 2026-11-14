import { useEffect, useMemo, useState } from "react";
import { useFriendsOf } from "./friendList";
import { useProfile, useSession } from "./session";
import PersonRow from "./PersonRow";
import { RowsSkeleton } from "./Skeleton";
import { CloseIcon } from "./icons";

/** A person's friends in a popup. Your own list is always shown; other people's only when they have not hidden it. */
export default function FriendsSheet({ uid, onClose, initialView = "all" }: { uid: string; onClose: () => void; initialView?: "all" | "mutual" }) {
  const s = useSession();
  const mine = uid === s.uid;
  const p = useProfile(uid);
  const shown = mine || p?.friendsVisible !== false;
  const theirs = useFriendsOf(uid, !mine && shown);
  const [view, setView] = useState<"all" | "mutual">(mine ? "all" : initialView);
  // Friends you have in common come first, and are marked "Mutual".
  const mutualIds = useMemo(() => new Set((theirs.uids ?? []).filter((id) => s.friends.has(id))), [theirs.uids, s.friends]);
  const all = mine ? [...s.friends] : theirs.uids && [...theirs.uids].sort((a, b) => Number(mutualIds.has(b)) - Number(mutualIds.has(a)));
  const list = !mine && view === "mutual" && all ? all.filter((id) => mutualIds.has(id)) : all;
  const name = mine ? "You" : p?.displayName || "This person";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Friends">
        <div className="sheet-head">
          <h2>{mine ? "Your friends" : `${p?.displayName ? `${p.displayName}'s` : "Their"} friends`}</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          {!mine && shown && !theirs.error && all && (
            <div className="sort-row" role="group" aria-label="Show">
              <button type="button" className={`sort-chip${view === "all" ? " on" : ""}`} aria-pressed={view === "all"} onClick={() => setView("all")}>All {all.length}</button>
              <button type="button" className={`sort-chip${view === "mutual" ? " on" : ""}`} aria-pressed={view === "mutual"} onClick={() => setView("mutual")}>Mutual {mutualIds.size}</button>
            </div>
          )}
          {!shown || theirs.error ? (
            <p className="hint notes-empty">{name} keeps the friends list private.</p>
          ) : list === null ? <RowsSkeleton />
            : list.length === 0 ? <p className="hint notes-empty">{mine ? "You have not added any friends yet." : view === "mutual" ? `You and ${name} have no mutual friends yet.` : `${name} has no friends to show yet.`}</p>
            : <ul className="people">{list.map((id) => <PersonRow key={id} uid={id} badge={!mine && mutualIds.has(id) ? <i className="mutual-badge">Mutual</i> : undefined} />)}</ul>}
          {mine && <p className="hint">Other people can see this list unless you turn it off in Settings, under Privacy.</p>}
        </div>
      </div>
    </div>
  );
}
