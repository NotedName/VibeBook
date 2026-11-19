import TimeField from "./TimeField";
import { useEffect, useState, type FormEvent } from "react";
import { addEntry, type Entry } from "./entries";
import { clockTime, longDay, nowStr, todayStr } from "./report";
import { breakComesAt, breakEndsAt, breakMinutesOf, clockIn, discardClock, editClockStart, endBreak, isOnBreak, clearStatus, publishHours, publishStatus, runningMinutes, startBreak, useHoursGoal, useRunningClock } from "./hours";
import { availableDaysIn, planOf, projectFinish } from "./availability";
import AvailabilitySheet from "./AvailabilitySheet";
import { formatHM, spanMinutes, sumMinutes, weekEnd, weekStart } from "./weeks";
import { useSession } from "./session";
import { ClockIcon, CoffeeIcon, EditIcon, ListIcon, PlayIcon, PlusIcon } from "./icons";
import { HoursSkeleton } from "./Skeleton";
import ConfirmDialog from "./ConfirmDialog";
import FormError from "./FormError";
import HoursLogSheet from "./HoursLogSheet";
import PastHoursSheet from "./PastHoursSheet";

/** A shift this long (or longer) needs the word typed before it can be thrown away. */
const LONG_SHIFT_MINUTES = 120;

const WEEKDAYS = [
  { day: 0, short: "Sun" }, { day: 1, short: "Mon" }, { day: 2, short: "Tue" }, { day: 3, short: "Wed" },
  { day: 4, short: "Thu" }, { day: 5, short: "Fri" }, { day: 6, short: "Sat" },
];

/** Hours spent against the hours required, plus Clock in / Clock out. `entries` are your own, unarchived entries. */
export default function HoursCard({ entries, loading = false }: { entries: Entry[]; /** the entries have not arrived yet */ loading?: boolean }) {
  const s = useSession();
  const goal = useHoursGoal(s.uid);
  const [daysOpen, setDaysOpen] = useState(false);
  const clock = useRunningClock(s.uid);
  const [now, setNow] = useState(() => Date.now());
  const [editingStart, setEditingStart] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [error, setError] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [confirming, setConfirming] = useState<null | "discard" | "start">(null);
  const [clocking, setClocking] = useState(false);
  // After "No, still on break" the question waits this long (epoch ms) before it is asked again.
  const [askAfter, setAskAfter] = useState(0);

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
  const plan = planOf(a);
  // Break time is used up while a break is still running (an extra break with no end): ask whether the person is actually working.
  const overBreakMin = clock && plan && clock.breakStart !== undefined && isOnBreak(clock, now, plan) && !clock.breakPlanned
    ? breakMinutesOf(clock, now, plan) - plan.minutes : -1;
  const askWorking = overBreakMin >= 0 && now >= askAfter;
  // What a full week would hold, and how long until the required hours are reached, counting only the days you can work.
  const weekDays = availableDaysIn(thisWeekStart, weekEnd(thisWeekStart), a);
  const weekCapacity = weekDays * a.hoursPerDay * 60;
  const todayMinutes = sumMinutes(entries.filter((e) => e.date === todayStr()));
  const required = goal.hours === null ? null : Math.round(goal.hours * 60);
  // Unless your hours are only for you (Settings > Privacy), the summary other people read follows your totals.
  const sharing = !!s.me && s.me.hoursAudience !== "private";
  useEffect(() => {
    if (!sharing || !goal.ready) return;
    publishHours(s.uid, spent, required).catch(() => {});
  }, [sharing, goal.ready, s.uid, spent, required]);
  // Likewise for the status (clocked in / on a break / back at): it exists only while the clock runs.
  const sharingStatus = !!s.me && s.me.statusAudience !== "private";
  const onBreakNow = !!clock && isOnBreak(clock, now, plan);
  const resumeAt = clock && onBreakNow ? breakEndsAt(clock, now, plan) : null;
  const sinceMs = clock ? new Date(`${clock.date}T${clock.time}`).getTime() : NaN;
  const clockKnown = clock !== undefined;
  const clockRunning = !!clock;
  useEffect(() => {
    if (!sharingStatus || !clockKnown) return;
    if (!clockRunning || Number.isNaN(sinceMs)) { clearStatus(s.uid).catch(() => {}); return; }
    publishStatus(s.uid, { since: sinceMs, onBreak: onBreakNow, breakEndsAt: resumeAt }).catch(() => {});
  }, [sharingStatus, clockKnown, clockRunning, s.uid, sinceMs, onBreakNow, resumeAt]);
  const pct = required ? Math.min(100, Math.round((spent / required) * 100)) : 0;
  const left = required === null ? 0 : required - spent;
  const projection = required === null ? null : projectFinish(left, todayStr(), todayMinutes, a);

  async function run(job: () => Promise<unknown>) {
    setError("");
    try { await job(); } catch (err) { setError((err as Error).message || "Something went wrong. Try again."); }
  }

  /**
   * Clocking out saves the shift straight away; no write-up is needed and nothing is posted. The shift is an hours-only
   * entry: it counts in your hours and is listed under Logged hours (Edit there to add what you did), not in the logbook.
   * A break that is still running ends now. Break time is not counted.
   */
  function clockOut() {
    if (!clock || clocking) return;
    const out = nowStr();
    if (out === clock.time) { setError("You clocked in this minute. Wait a moment, or use Discard."); return; }
    setClocking(true);
    run(async () => {
      const breakMinutes = breakMinutesOf(clock, Date.now(), plan);
      await addEntry(s.uid, {
        date: clock.date, time: clock.time, clockIn: clock.time, clockOut: out,
        ...(breakMinutes > 0 ? { breakMinutes } : {}),
        ...(clock.edited ? { startEdited: true, originalStart: clock.origTime, originalStartDate: clock.origDate } : {}),
        title: "Hours logged", description: "", skills: [], visibility: "private", groupIds: [], videoUrl: "", hoursOnly: true,
      }, []);
      await discardClock(s.uid);
      s.notify(`Clocked out · ${formatHM(Math.max(0, spanMinutes(clock.time, out) - breakMinutes))} logged`);
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
    run(async () => { await editClockStart(s.uid, startDate, startTime, clock!); setEditingStart(false); });
  }

  if (loading || !goal.ready) return <HoursSkeleton />;

  return (
    <section className="hours" aria-label="Hours">
      <div className="hours-top">
        <div className="hours-total">
          <b>{formatHM(spent)}</b>
          <span>{required !== null ? `of ${formatHM(required)} required` : "hours logged"}</span>
        </div>
        <div className="hours-actions">
          <button type="button" className="btn small" title="Edit required hours and available days" onClick={() => setDaysOpen(true)}>
            <EditIcon /><span className="lbl">Edit</span>
          </button>
          <button type="button" className="btn small" title="Add hours for a past date" onClick={() => setPastOpen(true)}>
            <PlusIcon /><span className="lbl">Past hours</span>
          </button>
          <button type="button" className="btn small" title="View logged hours" onClick={() => setLogOpen(true)}>
            <ListIcon /><span className="lbl">Logged hours</span>
          </button>
        </div>
      </div>

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
      {projection === null && required !== null && left > 0 && <p className="hint hours-line">No available days set, so there is no finish date.</p>}
      <p className="hint hours-line">
        This week: <b>{formatHM(thisWeek)}</b> logged
        {weekCapacity > 0
          ? <> · planned {formatHM(weekCapacity)} ({weekDays} available {weekDays === 1 ? "day" : "days"} × {formatHM(a.hoursPerDay * 60)}){thisWeek > weekCapacity && <> · <b>{formatHM(thisWeek - weekCapacity)} over plan</b></>}</>
          : <> · no available days this week</>}
      </p>
      <p className="hint hours-line">Available days: {WEEKDAYS.filter((d) => a.workDays.includes(d.day)).map((d) => d.short).join(" ") || "None"}{a.daysOff.length + a.daysOn.length > 0 ? ` · ${a.daysOff.length + a.daysOn.length} changed` : ""}</p>

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
                <small>{formatHM(runningMinutes(clock, now, plan))} so far{(() => {
                  if (isOnBreak(clock, now, plan)) {
                    const ends = breakEndsAt(clock, now, plan);
                    return ends === null ? " · on break, time paused" : ` · on break until ${clockTime(new Date(ends).toTimeString().slice(0, 5))}, time paused`;
                  }
                  const comes = breakComesAt(clock, now, plan);
                  if (comes !== null) return ` · break at ${clockTime(new Date(comes).toTimeString().slice(0, 5))}`;
                  return breakMinutesOf(clock, now, plan) > 0 ? ` · ${formatHM(breakMinutesOf(clock, now, plan))} break` : "";
                })()}</small>
                {clock.edited && <small className="start-edited">Start edited · was {clockTime(clock.origTime!)}{clock.origDate !== clock.date ? `, ${longDay(clock.origDate!)}` : ""}</small>}
              </span>
            </p>
            {editingStart ? (
              <form className="hours-form" onSubmit={saveStart}>
                <label>Date
                  <input type="date" value={startDate} max={todayStr()} required onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label>Started at
                  <TimeField value={startTime} required onChange={(v) => setStartTime(v)} />
                </label>
                <button type="submit" className="btn primary">Save</button>
                <button type="button" className="btn" onClick={() => setEditingStart(false)}>Cancel</button>
                {error && <FormError>{error}</FormError>}
              </form>
            ) : (
              <div className="clock-actions">
                <button type="button" className="btn primary" disabled={clocking} onClick={clockOut}>Clock out</button>
                <button type="button" className="btn break" onClick={() => run(() => (isOnBreak(clock, Date.now(), plan) ? endBreak(s.uid, clock, plan) : startBreak(s.uid, clock, plan)))}>
                  {isOnBreak(clock, now, plan) ? <><PlayIcon /> Resume</> : <><CoffeeIcon /> Break time</>}
                </button>
                <button type="button" className="btn" onClick={() => setConfirming("start")}>Edit start</button>
                <button type="button" className="btn danger" onClick={() => setConfirming("discard")}>Discard</button>
              </div>
            )}
          </div>
        )}
        {!editingStart && error && <FormError>{error}</FormError>}
      </div>
      {askWorking && clock && plan && (
        <ConfirmDialog title="Are you working again?" confirmLabel="Yes, I'm working" cancelLabel="No, still on break"
          onCancel={() => setAskAfter(Date.now() + 5 * 60000)}
          onConfirm={() => {
            // The break allowance ended `overBreakMin` minutes ago: the time since then counts as work, not break.
            const at = Math.max(clock.breakStart ?? 0, Date.now() - overBreakMin * 60000);
            run(() => endBreak(s.uid, clock, plan, at));
          }}>
          <p>Your {formatHM(plan.minutes)} of break time is used up{overBreakMin > 0 ? `, ${overBreakMin} min ago` : ""}, but your clock is still paused.</p>
          <p>If you are working, the time since your break ran out counts as work. If you are still on break, we will ask again in 5 minutes.</p>
        </ConfirmDialog>
      )}
      {confirming === "start" && clock && (
        <ConfirmDialog title="Change your start time?" confirmLabel="Yes, edit start"
          onCancel={() => setConfirming(null)} onConfirm={() => { setConfirming(null); startEditingStart(); }}>
          <p>You clocked in at <b>{clockTime(clock.time)}</b>{clock.date !== todayStr() ? `, ${longDay(clock.date)}` : ""}. Changing it changes how many hours this shift counts for.</p>
          <p>Only do this if you forgot to clock in on time or tapped it by mistake.</p>
        </ConfirmDialog>
      )}
      {confirming === "discard" && clock && (() => {
        const mins = runningMinutes(clock, now);
        const long = mins >= LONG_SHIFT_MINUTES || clock.date !== todayStr();
        return (
          <ConfirmDialog title="Discard this shift?" danger confirmLabel="Discard shift" typeToConfirm={long ? "discard" : undefined}
            onCancel={() => setConfirming(null)} onConfirm={() => { setConfirming(null); run(() => discardClock(s.uid)); }}>
            <p>You have been clocked in for <b>{formatHM(mins)}</b>. Discarding throws that time away: <b>nothing is logged</b> and it cannot be undone.</p>
            <p>To keep the hours, choose Cancel and then Clock out. To fix a wrong start, use Edit start.</p>
          </ConfirmDialog>
        );
      })()}
      {pastOpen && <PastHoursSheet defaultBreak={plan?.minutes ?? 0} onClose={() => setPastOpen(false)} />}
      {logOpen && <HoursLogSheet entries={entries} clock={clock ?? null} plan={plan} onClose={() => setLogOpen(false)} />}
      {daysOpen && <AvailabilitySheet uid={s.uid} hours={goal.hours} value={a} share={!!s.me && s.me.scheduleAudience !== "private"} onClose={() => setDaysOpen(false)} />}
    </section>
  );
}
