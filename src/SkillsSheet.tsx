import { useEffect, useMemo } from "react";
import { CloseIcon } from "./icons";
import { useScrollLock } from "./scrollLock";
import { capitalizeWords } from "./reportDocs";
import type { Entry } from "./entries";

/** Every skill in your entries, most used first, with how many entries and the first and last day for each. */
export default function SkillsSheet({ entries, onClose }: { entries: Entry[]; onClose: () => void }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const skills = useMemo(() => {
    const map = new Map<string, { name: string; count: number; last: string }>();
    for (const e of entries) for (const raw of e.skills) {
      const key = raw.trim().toLowerCase();
      if (!key) continue;
      const cur = map.get(key) ?? { name: capitalizeWords(raw.trim()), count: 0, last: "" };
      cur.count += 1; if (e.date > cur.last) cur.last = e.date;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [entries]);
  const max = Math.max(1, ...skills.map((k) => k.count));
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Skills">
        <div className="sheet-head">
          <h2>Skills ({skills.length})</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          {skills.length === 0 ? <p className="hint">Skills you add to your entries are listed here.</p> : (
            <ul className="skill-list">
              {skills.map((k) => (
                <li key={k.name}>
                  <i className="skill-bar" style={{ width: `${Math.max(8, Math.round((k.count / max) * 100))}%` }} aria-hidden="true" />
                  <b>{k.name}</b><span className="skill-count">{k.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
