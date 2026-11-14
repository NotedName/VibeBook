import { useState } from "react";

/** Most skills shown before the rest fold into a "+N more" chip, so a long list never stretches a card. */
export const SKILLS_SHOWN = 6;

/** The skills of an entry as chips: a limited number, each one kept inside the card, with the rest a tap away. */
export default function SkillChips({ skills }: { skills: string[] }) {
  const [all, setAll] = useState(false);
  if (skills.length === 0) return null;
  const hidden = skills.length - SKILLS_SHOWN;
  const shown = all || hidden <= 0 ? skills : skills.slice(0, SKILLS_SHOWN);
  return (
    <ul className="chips" aria-label="Skills">
      {shown.map((sk, i) => <li key={`${sk}-${i}`} title={sk}><span>{sk}</span></li>)}
      {hidden > 0 && (
        <li className="chip-more">
          <button type="button" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show less" : `+${hidden} more`}</button>
        </li>
      )}
    </ul>
  );
}
