import { useEffect, useState } from "react";
import { useCanSee } from "./audience";
import { useSharedStatus } from "./hours";
import { ClockIcon, CoffeeIcon } from "./icons";
import type { Audience } from "./types";

const at = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Whether someone is clocked in right now, on a break, and when they resume (Settings > Privacy > Who can see when I'm clocked in). Nothing is drawn when not. */
export default function SharedStatusCard({ uid, audience }: { uid: string; audience: Audience }) {
  const can = useCanSee(uid, audience);
  const status = useSharedStatus(uid, can === true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  if (can !== true || !status) return null;
  // A planned break ends by itself, so once its time has passed they are working again.
  const onBreak = status.onBreak && (status.breakEndsAt === null || now < status.breakEndsAt);
  return (
    <section className="hours" aria-label="Clock status">
      <p className="hint hours-line clock-status" role="status">
        {onBreak ? <CoffeeIcon /> : <ClockIcon />}
        {onBreak
          ? <span><b>On a break</b> · {status.breakEndsAt !== null ? `back at ${at(status.breakEndsAt)}` : "back time not set"}</span>
          : <span><b>Clocked in</b> since {at(status.since)}</span>}
      </p>
    </section>
  );
}
