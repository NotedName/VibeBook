import { useState } from "react";
import { setReaction, useReactions } from "./reactions";
import { subjectId } from "./commentStore";
import { REACTIONS, type ReactionType } from "./types";
import { ThumbUpIcon, ThumbDownIcon } from "./icons";

type Props = {
  ownerUid: string;
  entryId: string;
  /** React to this photo of the entry instead of the entry itself. */
  photoId?: string;
  /** Entry title, for the owner's notification. */
  title?: string;
  /** Signed-in viewer. Leave out for the read-only view on shared links. */
  myUid?: string;
  onError?: (message: string) => void;
  /** Called when a signed-out viewer tries to react. */
  onLocked?: () => void;
};

/** "Vibing" and "Not vibing" buttons with live counts, for the post's bottom action bar. One reaction per person per entry. */
export default function ReactionBar({ ownerUid, entryId: entry, photoId, title, myUid, onError, onLocked }: Props) {
  const entryId = subjectId(entry, photoId);
  const { summary, error } = useReactions(ownerUid, entryId, myUid);
  const [busy, setBusy] = useState(false);
  if (error) return null; // e.g. rules not deployed yet: hide rather than show broken buttons

  async function pick(type: ReactionType) {
    if (!myUid) return onLocked?.();
    if (busy) return;
    setBusy(true);
    try {
      await setReaction(ownerUid, entryId, myUid, summary?.mine ?? null, type, title === undefined ? undefined : { entryId: entry, photoId, title });
    } catch {
      onError?.("Could not save your reaction");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {REACTIONS.map((r) => {
        const on = summary?.mine === r.id;
        const count = summary?.[r.id] ?? 0;
        return (
          <button key={r.id} type="button" className={`act react-btn ${r.id}${on ? " on" : ""}`}
            aria-pressed={on} aria-label={r.label} disabled={busy}
            title={myUid ? r.label : "Sign in to react"} onClick={() => pick(r.id)}>
            {r.id === "vibing" ? <ThumbUpIcon filled={on} /> : <ThumbDownIcon filled={on} />}
            <span className="label">{r.label}</span>
            {count > 0 && <b className="count">{count}</b>}
          </button>
        );
      })}
    </>
  );
}
