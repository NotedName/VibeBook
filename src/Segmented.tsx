import { useRef } from "react";
import { useSlidingIndicator } from "./slide";

type Props<T extends string> = {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
};

/**
 * Material 3 segmented button: one connected row, the chosen segment is a tonal pill that slides to the one you tap.
 * Radio inputs underneath, so arrow keys and screen readers work like any radio group.
 */
export default function Segmented<T extends string>({ value, options, onChange, label, className = "" }: Props<T>) {
  const box = useRef<HTMLDivElement>(null);
  useSlidingIndicator(box, value);
  return (
    <div ref={box} className={`m3-seg ${className}`} role="radiogroup" aria-label={label}>
      <span className="ind" aria-hidden="true" />
      {options.map((o) => (
        <label key={o.id} className={value === o.id ? "on" : ""}>
          <input type="radio" name={label} checked={value === o.id} onChange={() => onChange(o.id)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
