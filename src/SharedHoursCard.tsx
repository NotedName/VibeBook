import { useCanSee } from "./audience";
import { useSharedHours } from "./hours";
import type { Audience } from "./types";
import { formatHM } from "./weeks";
import { HoursSkeleton } from "./Skeleton";

/** The hours someone has chosen to show on their profile (Settings > Privacy > Who can see my hours). Nothing is drawn when they have not. */
export default function SharedHoursCard({ uid, audience }: { uid: string; audience: Audience }) {
  const can = useCanSee(uid, audience);
  const hours = useSharedHours(uid, can === true);
  if (can !== true || hours === null) return null;
  if (hours === undefined) return <HoursSkeleton />;
  const { minutes, requiredMinutes } = hours;
  const pct = requiredMinutes ? Math.min(100, Math.round((minutes / requiredMinutes) * 100)) : 0;
  return (
    <section className="hours" aria-label="Hours">
      <div className="hours-top">
        <div className="hours-total">
          <b>{formatHM(minutes)}</b>
          <span>{requiredMinutes ? `of ${formatHM(requiredMinutes)} required` : "hours logged"}</span>
        </div>
      </div>
      {requiredMinutes && (
        <>
          <div className="hours-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
            aria-label={`${pct}% of required hours`}><i style={{ width: `${pct}%` }} /></div>
          <p className="hint hours-line">{minutes >= requiredMinutes ? "Required hours reached." : `${formatHM(requiredMinutes - minutes)} to go · ${pct}% done`}</p>
        </>
      )}
    </section>
  );
}
