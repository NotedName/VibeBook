import { GROUP_PRIVACY, GROUP_QUESTIONS_MAX, QUESTION_MAX, type GroupPrivacy } from "./types";
import { GlobeIcon, LockIcon, PlusIcon } from "./icons";

type Props = {
  privacy: GroupPrivacy;
  questions: string[];
  onPrivacy: (p: GroupPrivacy) => void;
  onQuestions: (q: string[]) => void;
  disabled?: boolean;
};

/**
 * Public or private, and for a private group the questions people answer when they ask to join. Shared by the new-group
 * sheet and Manage group. Blank questions are dropped when the group is saved.
 */
export default function GroupAccessFields({ privacy, questions, onPrivacy, onQuestions, disabled = false }: Props) {
  const set = (i: number, v: string) => onQuestions(questions.map((q, j) => (j === i ? v : q)));
  return (
    <>
      <fieldset className="vis-pick" disabled={disabled}>
        <legend>Who can join</legend>
        <div className="seg two">
          {GROUP_PRIVACY.map((p) => (
            <label key={p.id} className={privacy === p.id ? "on" : ""}>
              <input type="radio" name="group-privacy" value={p.id} checked={privacy === p.id} onChange={() => onPrivacy(p.id)} />
              {p.id === "private" ? <LockIcon /> : <GlobeIcon />}
              {p.label}
            </label>
          ))}
        </div>
        <p className="hint">{GROUP_PRIVACY.find((p) => p.id === privacy)!.hint}</p>
      </fieldset>

      {privacy === "private" && (
        <fieldset className="join-questions" disabled={disabled}>
          <legend>Questions for people who ask to join <small>(optional)</small></legend>
          <p className="hint">People who ask to join write a short note on why. Add questions, such as school or team.</p>
          {questions.map((q, i) => (
            <div className="q-row" key={i}>
              <input value={q} maxLength={QUESTION_MAX} onChange={(e) => set(i, e.target.value)}
                aria-label={`Question ${i + 1}`} placeholder="e.g. Which section are you in?" />
              <button type="button" className="icon-btn" aria-label={`Remove question ${i + 1}`}
                onClick={() => onQuestions(questions.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {questions.length < GROUP_QUESTIONS_MAX && (
            <button type="button" className="btn small" onClick={() => onQuestions([...questions, ""])}><PlusIcon /> Add a question</button>
          )}
        </fieldset>
      )}
    </>
  );
}
