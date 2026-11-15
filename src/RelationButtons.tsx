import { useEffect, useState } from "react";
import { acceptRequest, cancelRequest, declineRequest, follow, sendRequest, unfollow, unfriend } from "./social";
import { useProfile, useSession } from "./session";
import { RateLimitError } from "./rateLimit";
import { CheckIcon, MessagesIcon } from "./icons";

/** Add friend / accept / follow controls for one other person. */
export default function RelationButtons({ uid }: { uid: string }) {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  // Set the moment Accept goes through, so the buttons change to Friends at once instead of waiting for the live data to catch up.
  const [accepted, setAccepted] = useState(false);
  const person = useProfile(uid);
  const live = s.relationOf(uid);
  const rel = accepted && live === "incoming" ? "friends" : live;
  const following = s.following.has(uid);
  // A private profile shares nothing with followers who are not friends, so there is nothing to follow.
  const closed = person?.privateProfile === true;

  useEffect(() => { if (live === "friends") setAccepted(false); }, [live]);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  if (rel === "self") return null;

  async function run(fn: () => Promise<unknown>, ok: string): Promise<boolean> {
    setBusy(true);
    try { await fn(); s.notify(ok); return true; }
    catch (err) { s.notify(err instanceof RateLimitError ? err.message : "That did not go through. Try again."); return false; }
    finally { setBusy(false); setArmed(false); }
  }

  async function accept() {
    setAccepted(true);
    const first = person?.displayName?.trim().split(/\s+/)[0];
    const ok = await run(() => acceptRequest(s.uid, uid, s.outgoing.some((r) => r.to === uid)), first ? `You and ${first} are now friends` : "You are now friends");
    if (!ok) setAccepted(false);
  }

  return (
    <div className="relation">
      {rel === "none" && (
        <button type="button" className="btn primary" disabled={busy}
          onClick={() => run(() => sendRequest(s.uid, uid), "Friend request sent")}>Add friend</button>
      )}
      {rel === "outgoing" && (
        <button type="button" className="btn" disabled={busy}
          onClick={() => run(() => cancelRequest(s.uid, uid), "Request cancelled")}>Cancel request</button>
      )}
      {rel === "incoming" && (
        <>
          <button type="button" className="btn primary" disabled={busy}
            onClick={accept}>Accept</button>
          <button type="button" className="btn" disabled={busy}
            onClick={() => run(() => declineRequest(s.uid, uid), "Request declined")}>Decline</button>
        </>
      )}
      {(rel === "friends" || rel === "none" || rel === "incoming" || rel === "outgoing") && (
        <a className="btn" href={`#/m/${encodeURIComponent(uid)}`} title="Message"><MessagesIcon /><span className="lbl">Message</span></a>
      )}
      {rel === "friends" && (
        <button type="button" className={`btn${armed ? " armed" : ""}`} disabled={busy}
          onClick={() => (armed ? run(() => unfriend(s.uid, uid), "Removed from friends") : setArmed(true))}>
          {armed ? "Tap to unfriend" : <><CheckIcon /><span className="lbl">Friends</span></>}
        </button>
      )}
      {rel !== "friends" && (following || !closed) && (
        <button type="button" className={`btn${following ? " on" : ""}`} disabled={busy}
          onClick={() => run(() => (following ? unfollow(s.uid, uid) : follow(s.uid, uid)), following ? "Unfollowed" : "Following")}>
          {following ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}
