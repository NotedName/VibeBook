import { useState } from "react";
import { useCanSee } from "./audience";
import SharedScheduleSheet from "./SharedScheduleSheet";
import { useProfile } from "./session";
import { CalendarIcon } from "./icons";
import { useSharedSchedule } from "./hours";
import { formatHM } from "./weeks";
import type { Audience } from "./types";

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon to Fri", "Mon to Wed, Sat": runs of days in the order the logbook uses (Sunday first). */
function describeDays(days: number[]): string {
  const order = [0, 1, 2, 3, 4, 5, 6].filter((d) => days.includes(d));
  const runs: number[][] = [];
  for (const d of order) {
    const last = runs[runs.length - 1];
    if (last && (last[last.length - 1] + 1) % 7 === d && d !== 0) last.push(d); else runs.push([d]);
  }
  return runs.map((r) => (r.length > 2 ? `${NAMES[r[0]]} to ${NAMES[r[r.length - 1]]}` : r.map((d) => NAMES[d]).join(", "))).join(", ");
}

/** The usual week someone has chosen to show on their profile (Settings > Privacy > Who can see my schedule). Nothing is drawn when they have not. */
export default function SharedScheduleCard({ uid, audience }: { uid: string; audience: Audience }) {
  const can = useCanSee(uid, audience);
  const schedule = useSharedSchedule(uid, can === true);
  const [open, setOpen] = useState(false);
  const person = useProfile(uid);
  if (can !== true || !schedule) return null;
  return (
    <section className="hours" aria-label="Schedule">
      <p className="hint hours-line">Works <b>{schedule.workDays.length ? describeDays(schedule.workDays) : "no set days"}</b> · {formatHM(schedule.hoursPerDay * 60)} a day</p>
      <button type="button" className="btn small schedule-days-btn" onClick={() => setOpen(true)}><CalendarIcon /> See day by day</button>
      {open && <SharedScheduleSheet name={person?.displayName || "Their"} schedule={schedule} onClose={() => setOpen(false)} />}
    </section>
  );
}
