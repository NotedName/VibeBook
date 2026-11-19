/**
 * A time picked from three lists (hour, minutes, AM / PM) instead of typed into a small field, so it works the same with a mouse,
 * a finger and a keyboard. The value is "HH:MM" in 24 hours, or "" while nothing is chosen.
 */
export default function TimeField({ value, onChange, required }: { value: string; onChange: (value: string) => void; required?: boolean }) {
  const ok = /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const h24 = ok ? Number(value.slice(0, 2)) : null;
  const min = ok ? value.slice(3) : "";
  const pm = h24 !== null && h24 >= 12;
  const h12 = h24 === null ? "" : String(h24 % 12 === 0 ? 12 : h24 % 12);
  const pad = (n: number) => String(n).padStart(2, "0");

  function emit(nextH12: string, nextMin: string, nextPm: boolean) {
    if (!nextH12 && !nextMin) return onChange("");
    const h = Number(nextH12 || 12) % 12 + (nextPm ? 12 : 0);
    onChange(`${pad(h)}:${nextMin || "00"}`);
  }

  return (
    <span className="time-field" role="group" aria-label="Time">
      <select aria-label="Hour" value={h12} required={required} onChange={(e) => emit(e.target.value, min, pm)}>
        <option value="" disabled hidden>--</option>
        {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
      </select>
      <b aria-hidden="true">:</b>
      <select aria-label="Minutes" value={min} required={required} onChange={(e) => emit(h12, e.target.value, pm)}>
        <option value="" disabled hidden>--</option>
        {Array.from({ length: 60 }, (_, i) => <option key={i} value={pad(i)}>{pad(i)}</option>)}
      </select>
      <select aria-label="AM or PM" value={pm ? "pm" : "am"} onChange={(e) => emit(h12, min, e.target.value === "pm")}>
        <option value="am">AM</option>
        <option value="pm">PM</option>
      </select>
    </span>
  );
}
