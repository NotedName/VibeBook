import { useEffect, useState, type FormEvent } from "react";
import { addEntry, type Entry } from "./entries";
import { clockTime, longDay, nowStr, todayStr } from "./report";
import { discardClock, clockIn, editClockStart, MAX_REQUIRED_HOURS, publishHours, runningMinutes, setRequiredHours, useHoursGoal, useRunningClock } from "./hours";
import { availableDaysIn, projectFinish } from "./availability";
import AvailabilitySheet from "./AvailabilitySheet";
import { formatHM, spanMinutes, sumMinutes, weekEnd, weekStart } from "./weeks";
import { useSession } from "./session";
import { ClockIcon, EditIcon } from "./icons";
import { HoursSkeleton } from "./Skeleton";

const WEEKDAYS = [
  { day: 1, short: "Mon" }, { day: 2, short: "Tue" }, { day: 3, short: "Wed" }, { day: 4, short: "Thu" },
  { day: 5, short: "Fri" }, { day: 6, short: "Sat" }, { day: 0, short: "Sun" },
];

/** Hours spent against the hours required, plus Clock in / Clock out. `entries` are your own, unarchived entries. */
export default function HoursCard({ entries, loading = false }: { entries: Entry[]; /** the entries have not arrived yet */ loading?: boolean }) {
  const s = useSession();
  const goal = useHoursGoal(s.uid);
  const [daysOpen, setDaysOpen] = useState(false);
  const clock = useRunningClock(s.uid);
  const [now, setNow] = useState(() => Date.now());
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalText, setGoalText] = useState("");
  const [editingStart, setEditingStart] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [error, setError] = useState("");
  const [armedDiscard, setArmedDiscard] = useState(false);
  const [clocking, setClocking] = useState(false);

  // The running time ticks once a minute, and again when the tab comes back.
  useEffect(() => {
    if (!clock) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [clock]);

  const spent = sumMinutes(entries);
  const thisWeekStart = weekStart(todayStr());
  const thisWeek = sumMinutes(entries.filter((e) => e.date >= thisWeekStart && e.date <= weekEnd(thisWeekStart)));
  const a = goal.availability;
  // What a full week would hold, and how long until the required hours are reached, counting only the days you can work.
  const weekCapacity = availableDaysIn(thisWeekStart, weekEnd(thisWeekStart), a) * a.hoursPerDay * 60;
  const todayMinutes = sumMinutes(entries.filter((e) => e.date === todayStr()));
  const required = goal.hours === null ? null : Math.round(goal.hours * 60);
  // While "Show my hours" is on (Settings > Privacy), the summary other people read follows your totals.
  const sharing = s.me?.hoursVisible === true;
  useEffect(() => {
    if (!sharing || !goal.ready) return;
    publishHours(s.uid, spent, required).catch(() => {});
  }, [sharing, goal.ready, s.uid, spent, required]);
  const pct = required ? Math.min(100, Math.round((spent / required) * 100)) : 0;
  const left = required === null ? 0 : required - spent;
  const projection = required === null ? null : projectFinish(left, todayStr(), todayMinutes, a);

  async function run(job: () => Promise<unknown>) {
    setError("");
    try { await job(); } catch (err) { setError((err as Error).message || "Something went wrong. Try again."); }
  }

  function saveGoal(e: FormEvent) {
    e.preventDefault();
    const n = Number(goalText.replace(",", "."));
    if (goalText.trim() !== "" && (!Number.isFinite(n) || n < 0 || n > MAX_REQUIRED_HOURS)) {
      setError(`Enter the hours as a number from 1 to ${MAX_REQUIRED_HOURS}, or leave it empty to remove the goal.`);
      return;
    }
    run(async () => { await setRequiredHours(s.uid, goalText.trim() === "" ? 0 : n); setEditingGoal(false); });
  }

  function startEditingGoal() {
    setGoalText(goal.hours === null ? "" : String(goal.hours));
    setEditingGoal(true);
    setError("");
  }

  /**
   * Clocking out saves the shift straight away; no write-up is needed. The hours are kept as a private entry that you can
   * open later (Edit) to add what you did, the skills and photos.
   */
  function clockOut() {
    if (!clock || clocking) return;
    const out = nowStr();
    if (out === clock.time) { setError("You clocked in this minute. Wait a moment, or use Discard."); return; }
    setClocking(true);
    run(async () => {
      await addEntry(s.uid, {
        date: clock.date, time: clock.time, clockIn: clock.time, clockOut: out,
        title: "Hours logged", description: "", skills: [], visibility: "private", groupIds: [], videoUrl: "",
      }, []);
      await discardClock(s.uid);
      s.notify(`Clocked out · ${formatHM(spanMinutes(clock.time, out))} logged`);
    }).finally(() => setClocking(false));
  }

  function startEditingStart() {
    if (!clock) return;
    setStartDate(clock.date);
    setStartTime(clock.time);
    setEditingStart(true);
    setError("");
  }

  function saveStart(e: FormEvent) {
    e.preventDefault();
    if (!startDate || !startTime) return;
    if (new Date(`${startDate}T${startTime}`).getTime() > Date.now()) { setError("The start time cannot be in the future."); return; }
    run(async () => { await editClockStart(s.uid, startDate, startTime); setEditingStart(false); });
  }

  if (loading || !goal.ready) return <HoursSkeleton />;

  return (
    <section className="hours" aria-label="Hours">
      <div className="hours-top">
        <div className="hours-total">
          <b>{formatHM(spent)}</b>
          <span>{required !== null ? `of ${formatHM(required)} required` : "hours logged"}</span>
        </div>
        <button type="button" className="btn small" onClick={startEditingGoal}>
          <EditIcon /> {required === null ? "Set required hours" : "Edit"}
        </button>
      </div>

      {editingGoal && (
        <form className="hours-form" onSubmit={saveGoal}>
          <label>Hours required
            <input type="number" inputMode="decimal" min="0" max={MAX_REQUIRED_HOURS} step="0.5" autoFocus
              value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="e.g. 486" />
          </label>
          <button type="submit" className="btn primary">Save</button>
          <button type="button" className="btn" onClick={() => setEditingGoal(false)}>Cancel</button>
        </form>
      )}

      {required !== null && (
        <>
          <div className="hours-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
            aria-label={`${pct}% of required hours`}><i style={{ width: `${pct}%` }} /></div>
          <p className="hint hours-line">
            {left > 0 ? `${formatHM(left)} to go · ${pct}% done` : left === 0 ? "Required hours reached." : `Required hours reached, ${formatHM(-left)} over.`}
          </p>
        </>
      )}
      {projection && projection !== "done" && (
        <p className="hint hours-line">
          About <b>{projection.availableDays}</b> more available {projection.availableDays === 1 ? "day" : "days"} at {formatHM(a.hoursPerDay * 60)} a day · finishing around <b>{longDay(projection.finishDate)}</b>
        </p>
      )}
      {projection === null && required !== null && left > 0 && <p className="hint hours-line">No available days are set, so a finish date cannot be worked out.</p>}
      <p className="hint hours-line">This week: <b>{formatHM(thisWeek)}</b>{weekCapacity > 0 && <> of {formatHM(weekCapacity)} available</>}</p>
      <div className="hours-days">
        <button type="button" className="btn small" onClick={() => setDaysOpen(true)}>Available days</button>
        <span className="hint">{WEEKDAYS.filter((d) => a.workDays.includes(d.day)).map((d) => d.short).join(" ") || "None"}{a.daysOff.length + a.daysOn.length > 0 ? ` · ${a.daysOff.length + a.daysOn.length} changed` : ""}</span>
      </div>

      <div className="clock-row">
        {clock === undefined ? null : clock === null ? (
          <button type="button" className="btn primary" onClick={() => run(() => clockIn(s.uid))}>
            <ClockIcon /> Clock in
          </button>
        ) : (
          <div className="clock-live">
            <p className="clock-status" role="status">
              <ClockIcon />
              <span>
                Clocked in at {clockTime(clock.time)}{clock.date !== todayStr() ? `, ${longDay(clock.date)}` : ""}
                <small>{formatHM(runningMinutes(clock, now))} so far</small>
              </span>
            </p>
            {editingStart ? (
              <form className="hours-form" onSubmit={saveStart}>
                <label>Date
                  <input type="date" value={startDate} max={todayStr()} required onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label>Started at
                  <input type="time" value={startTime} required onChange={(e) => setStartTime(e.target.value)} />
                </label>
                <button type="submit" className="btn primary">Save</button>
                <button type="button" className="btn" onClick={() => setEditingStart(false)}>Cancel</button>
              </form>
            ) : (
              <div className="clock-actions">
                <button type="button" className="btn primary" disabled={clocking} onClick={clockOut}>Clock out</button>
                <button type="button" className="btn" onClick={startEditingStart}>Edit start</button>
                <button type="button" className={`btn${armedDiscard ? " danger" : ""}`}
                  onClick={() => { if (!armedDiscard) { setArmedDiscard(true); return; } setArmedDiscard(false); run(() => discardClock(s.uid)); }}
                  onBlur={() => setArmedDiscard(false)}>{armedDiscard ? "Tap again to discard" : "Discard"}</button>
              </div>
            )}
          </div>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {daysOpen && <AvailabilitySheet uid={s.uid} value={a} onClose={() => setDaysOpen(false)} />}
    </section>
  );
}
