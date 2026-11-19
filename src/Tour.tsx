import { useEffect, useMemo, useState } from "react";
import { TOUR_STEPS, TOUR_VERSION } from "./tourSteps";
import { useScrollLock } from "./scrollLock";
import { CloseIcon } from "./icons";

const key = (uid: string) => `vibebook.tourSeen.${uid}`;
const seenVersion = (uid: string) => { try { return Number(localStorage.getItem(key(uid))) || 0; } catch { return TOUR_VERSION; } };
const markSeen = (uid: string) => { try { localStorage.setItem(key(uid), String(TOUR_VERSION)); } catch { /* the tour may show again */ } };

/** True when this person has not seen the newest tour yet. */
export const tourDue = (uid: string) => seenVersion(uid) < TOUR_VERSION;

/**
 * A short tour of what the app does. New people see every step; returning people see only what is new since they last saw it.
 * It can always be skipped, and it can be replayed from Settings > About.
 */
export default function Tour({ uid, all, onClose }: { uid: string; /** show every step, not only the new ones */ all?: boolean; onClose: () => void }) {
  useScrollLock();
  const steps = useMemo(() => {
    const seen = all ? 0 : seenVersion(uid);
    const list = TOUR_STEPS.filter((s) => s.since > seen);
    return list.length ? list : TOUR_STEPS;
  }, [uid, all]);
  const [i, setI] = useState(0);
  const last = i === steps.length - 1;
  const finish = () => { markSeen(uid); onClose(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); else if (e.key === "ArrowRight" && !last) setI((n) => n + 1); else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1)); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);
  const step = steps[i];
  const isNew = !all && seenVersion(uid) > 0;
  return (
    <div className="overlay tour-overlay">
      <div className="sheet tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        <div className="sheet-head">
          <h2 id="tour-title">{isNew ? "What's new" : "Welcome to VibeBook"}</h2>
          <button type="button" className="icon-btn close" aria-label="Skip the tour" onClick={finish}><CloseIcon /></button>
        </div>
        <div className="sheet-body tour-body" aria-live="polite">
          <div className="tour-step" key={step.id}>
            <span className="tour-count">{i + 1} of {steps.length}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </div>
          <div className="tour-dots" aria-hidden="true">{steps.map((s, n) => <i key={s.id} className={n === i ? "on" : ""} />)}</div>
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={finish}>Skip</button>
          {i > 0 && <button type="button" className="btn" onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" className="btn primary" onClick={() => (last ? finish() : setI(i + 1))}>{last ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
