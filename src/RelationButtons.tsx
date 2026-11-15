import { useEffect, useState } from "react";
import { acceptRequest, cancelRequest, declineRequest, follow, sendRequest, unfollow, unfriend } from "./social";
import { useSession } from "./session";
import { CheckIcon, MessagesIcon } from "./icons";

/** Add friend / accept / follow controls for one other person. */
export default function RelationButtons({ uid }: { uid: string }) {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const rel = s.relationOf(uid);
  const following = s.following.has(uid);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  if (rel === "self") return null;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); s.notify(ok); }
    catch { s.notify("That did not go through. Try again."); }
    finally { setBusy(false); setArmed(false); }
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
            onClick={() => run(() => acceptRequest(s.uid, uid, s.outgoing.some((r) => r.to === uid)), "You are now friends")}>Accept</button>
          <button type="button" className="btn" disabled={busy}
            onClick={() => run(() => declineRequest(s.uid, uid), "Request declined")}>Decline</button>
        </>
      )}
      {rel === "friends" && (
        <a className="btn" href={`#/m/${encodeURIComponent(uid)}`} title="Message"><MessagesIcon /><span className="lbl">Message</span></a>
      )}
      {rel === "friends" && (
        <button type="button" className={`btn${armed ? " armed" : ""}`} disabled={busy}
          onClick={() => (armed ? run(() => unfriend(s.uid, uid), "Removed from friends") : setArmed(true))}>
          {armed ? "Tap to unfriend" : <><CheckIcon /><span className="lbl">Friends</span></>}
        </button>
      )}
      {rel !== "friends" && (
        <button type="button" className={`btn${following ? " on" : ""}`} disabled={busy}
          onClick={() => run(() => (following ? unfollow(s.uid, uid) : follow(s.uid, uid)), following ? "Unfollowed" : "Following")}>
          {following ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}
