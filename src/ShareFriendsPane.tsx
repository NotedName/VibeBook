import { useMemo, useState } from "react";
import type { Entry } from "./entries";
import { useProfile, useSession } from "./session";
import { RateLimitError } from "./rateLimit";
import { MAX_RECIPIENTS, NOTE_MAX, sendEntryToFriends } from "./shareEntry";
import { postLink } from "./share";
import Avatar from "./Avatar";
import FormError from "./FormError";
import { CheckIcon } from "./icons";

function FriendChoice({ uid, picked, disabled, onToggle }: { uid: string; picked: boolean; disabled: boolean; onToggle: () => void }) {
  const p = useProfile(uid);
  const name = p === undefined ? "…" : p?.displayName || "VibeBook member";
  return (
    <label className={`invite-row${picked ? " on" : ""}${disabled && !picked ? " off" : ""}`}>
      <input type="checkbox" checked={picked} disabled={disabled && !picked} onChange={onToggle} />
      <Avatar profile={p} size="sm" />
      <span className="invite-name">{name}{p?.username && <small>@{p.username}</small>}</span>
      {picked && <CheckIcon />}
    </label>
  );
}

/** Pick one or more friends, add a note if you like, and send them the link to the entry as a chat message. */
export default function ShareFriendsPane({ entry, ownerUid, onDone }: { entry: Entry; ownerUid: string; onDone: () => void }) {
  const s = useSession();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const friends = useMemo(() => Array.from(s.friends), [s.friends]);
  const full = picked.length >= MAX_RECIPIENTS;
  const toggle = (uid: string) => setPicked((l) => (l.includes(uid) ? l.filter((x) => x !== uid) : [...l, uid]));

  async function send() {
    setBusy(true);
    setError("");
    try {
      const { sent, failed } = await sendEntryToFriends(s.uid, ownerUid, entry, note, picked.map((uid) => ({
        uid, first: s.chats.all.some((c) => c.other === uid) ? undefined : { friend: true },
      })));
      if (failed.length === 0) { s.notify(sent.length === 1 ? "Sent to your friend" : `Sent to ${sent.length} friends`); onDone(); return; }
      if (sent.length === 0) { setError(failed[0].reason); return; }
      // Some got it: keep only the ones that did not, so pressing Send again does not message the others twice.
      setPicked(failed.map((f) => f.uid));
      setError(`Sent to ${sent.length}, but ${failed.length} could not get it: ${failed[0].reason} Press Send to try those again.`);
    } catch (err) {
      setError(err instanceof RateLimitError ? err.message : "That did not go through. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="sheet-body">
        <p className="msg-actions-preview"><b>{entry.title}</b>{"\n"}{postLink(ownerUid, entry.id)}</p>
        {friends.length === 0 ? (
          <p className="hint">Add some friends first, then you can send entries to them.</p>
        ) : (
          <fieldset className="group-pick">
            <legend>Send to{picked.length > 0 ? ` (${picked.length})` : ""}</legend>
            <div className="invite-list">
              {friends.map((uid) => <FriendChoice key={uid} uid={uid} picked={picked.includes(uid)} disabled={full} onToggle={() => toggle(uid)} />)}
            </div>
            <p className="hint">Pick as many friends as you like (up to {MAX_RECIPIENTS} at a time). Each one gets it as a message.</p>
          </fieldset>
        )}
        <label>Add a message (optional)
          <textarea className="share-note" rows={3} maxLength={NOTE_MAX} value={note} placeholder="Say something about it…" onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <FormError>{error}</FormError>}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onDone} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy || picked.length === 0} onClick={() => void send()}>
          {busy ? "Sending…" : picked.length > 1 ? `Send to ${picked.length}` : "Send"}
        </button>
      </div>
    </>
  );
}
