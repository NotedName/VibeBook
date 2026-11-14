import { useState } from "react";
import { EMOJI_CATEGORIES } from "./emoji";

/** Grid of emoji in categories. Picking one calls onPick and leaves the panel open for more. */
export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [cat, setCat] = useState(0);
  const current = EMOJI_CATEGORIES[cat];
  // keep the text field's focus and cursor while tapping
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="emoji-picker">
      <div className="emoji-cats" role="tablist" aria-label="Emoji categories">
        {EMOJI_CATEGORIES.map((c, i) => (
          <button key={c.label} type="button" role="tab" aria-selected={i === cat} aria-label={c.label} title={c.label}
            className={i === cat ? "on" : ""} onMouseDown={keepFocus} onClick={() => setCat(i)}>{c.icon}</button>
        ))}
      </div>
      <div className="emoji-grid" role="group" aria-label={current.label}>
        {current.emojis.map((e) => (
          <button key={e} type="button" aria-label={`Emoji ${e}`} onMouseDown={keepFocus} onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
    </div>
  );
}
