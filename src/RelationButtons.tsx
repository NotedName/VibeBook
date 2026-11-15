import { useEffect, useState } from "react";
import { acceptRequest, cancelRequest, declineRequest, follow, sendRequest, unfollow, unfriend } from "./social";
import { useProfile, useSession } from "./session";
import { RateLimitError } from "./rateLimit";
import { CheckIcon, MessagesIcon } from "./icons";

/** Add friend / accept / follow controls for one other person. */
export default function RelationButtons({ uid }: { uid: string }) {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState<"" | "unfriend" | "unfollow">("");
  // Set the moment Accept goes through, so the buttons change to Friends at once instead of waiting for the live data to catch up.
  const [accepted, setAccepted] = useState(false);
  const person = useProfile(uid);
  const live = s.relationOf(uid);
  const rel = accepted && live === "incoming" ? "friends" : live;
  const following = s.following.has(uid); // friends count as followed until you unfollow them
  // A private profile shares nothing with followers who are not friends, so there is nothing to follow.
  const closed = person?.privateProfile === true;

  useEffect(() => { if (live === "friends") setAccepted(false); }, [live]);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(""), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  if (rel === "self") return null;

  async function run(fn: () => Promise<unknown>, ok: string): Promise<boolean> {
    setBusy(true);
    try { await fn(); s.notify(ok); return true; }
    catch (err) { s.notify(err instanceof RateLimitError ? err.message : "That did not go through. Try again."); return false; }
    finally { setBusy(false); setArmed(""); }
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
        <button type="button" className={`btn${armed === "unfriend" ? " armed" : ""}`} disabled={busy}
          onClick={() => (armed === "unfriend" ? run(() => unfriend(s.uid, uid), "Removed from friends") : setArmed("unfriend"))}>
          {armed === "unfriend" ? "Tap to unfriend" : <><CheckIcon /><span className="lbl">Friends</span></>}
        </button>
      )}
      {(rel === "friends" || following || !closed) && (following ? (
        <button type="button" className={`btn on${armed === "unfollow" ? " armed" : ""}`} disabled={busy}
          title="You see their entries in your Following feed. Tap to unfollow."
          onClick={() => (armed === "unfollow"
            ? run(() => unfollow(s.uid, uid, rel === "friends"), rel === "friends" ? "Unfollowed. You are still friends." : "Unfollowed")
            : setArmed("unfollow"))}>
          {armed === "unfollow" ? "Tap to unfollow" : "Following"}
        </button>
      ) : (
        <button type="button" className="btn" disabled={busy} title="See their entries in your Following feed"
          onClick={() => run(() => follow(s.uid, uid, rel === "friends"), "Following")}>
          Follow
        </button>
      ))}
    </div>
  );
}
