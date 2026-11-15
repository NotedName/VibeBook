import { useState } from "react";
import { useCanSee } from "./audience";
import SharedScheduleSheet from "./SharedScheduleSheet";
import { useProfile } from "./session";
import { CalendarIcon } from "./icons";
import { useSharedSchedule } from "./hours";
import { formatHM } from "./weeks";
import { describeDays } from "./availability";
import type { Audience } from "./types";

/** The usual week someone has chosen to show on their profile (Settings > Privacy > Who can see my schedule). Nothing is drawn when they have not. */
export default function SharedScheduleCard({ uid, audience }: { uid: string; audience: Audience }) {
  const can = useCanSee(uid, audience);
  const schedule = useSharedSchedule(uid, can === true);
  const [open, setOpen] = useState(false);
  const person = useProfile(uid);
  if (can !== true || !schedule) return null;
  return (
    <section className="hours" aria-label="Schedule">
      <div className="schedule-line">
        <button type="button" className="btn small" onClick={() => setOpen(true)}><CalendarIcon /> Schedule</button>
        <p className="hint hours-line">Works <b>{schedule.workDays.length ? describeDays(schedule.workDays) : "no set days"}</b> · {formatHM(schedule.hoursPerDay * 60)} a day</p>
      </div>
      {open && <SharedScheduleSheet name={person?.displayName || "Their"} schedule={schedule} onClose={() => setOpen(false)} />}
    </section>
  );
}
