import { useEffect, useState, type Ref } from "react";
import { USERNAME_MAX, isUsernameAvailable, normalizeUsername, usernameProblem } from "./profiles";

type Status = "idle" | "invalid" | "checking" | "free" | "taken" | "error";
export type UsernameState = { status: Status; message: string };

/** Checks a username as it is typed: format first, then (after a short pause) whether anyone already has it. */
export function useUsernameCheck(raw: string, selfUid?: string): UsernameState {
  const [state, setState] = useState<UsernameState>({ status: "idle", message: "" });
  useEffect(() => {
    const name = normalizeUsername(raw);
    if (!name) { setState({ status: "idle", message: "" }); return; }
    const problem = usernameProblem(name);
    if (problem) { setState({ status: "invalid", message: problem }); return; }
    setState({ status: "checking", message: "Checking…" });
    let live = true;
    const t = setTimeout(() => {
      isUsernameAvailable(name, selfUid).then(
        (free) => live && setState(free
          ? { status: "free", message: `@${name} is available` }
          : { status: "taken", message: `@${name} is already taken` }),
        () => live && setState({ status: "error", message: "Could not check right now. We will check again when you continue." }),
      );
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [raw, selfUid]);
  return state;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Your own uid when editing, so keeping your current username does not count as "taken". */
  selfUid?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Shown under the field; defaults to the profile link preview. */
  hint?: string;
};

/** "@username" input with live format and availability feedback, shared by sign-up and Edit profile. */
export default function UsernameField({ value, onChange, selfUid, inputRef, hint }: Props) {
  const state = useUsernameCheck(value, selfUid);
  const name = normalizeUsername(value);
  return (
    <label>Username
      <span className="username-field">
        <span className="at" aria-hidden="true">@</span>
        <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} required
          maxLength={USERNAME_MAX + 1} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="juandelacruz" aria-describedby="username-status" aria-invalid={state.status === "invalid" || state.status === "taken"} />
      </span>
      <small id="username-status" className={`username-status ${state.status}`} role="status" aria-live="polite">
        {state.message || hint || `Your profile link will end in /u/${name || "username"}`}
      </small>
    </label>
  );
}
