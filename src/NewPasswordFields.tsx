import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";
import { MIN_PASSWORD, STRENGTH_LABEL, strength } from "./password";

/** A new password typed twice, with a strength meter and a show/hide button. The parent owns the values and checks them with newPasswordProblem. */
export default function NewPasswordFields({ password, confirm, onPassword, onConfirm, label = "New password" }: {
  password: string; confirm: string; onPassword: (v: string) => void; onConfirm: (v: string) => void; label?: string;
}) {
  const [show, setShow] = useState(false);
  const level = strength(password);
  const mismatch = confirm.length > 0 && confirm.length >= password.length && confirm !== password;
  return (
    <>
      <label>{label}
        <span className="pw">
          <input type={show ? "text" : "password"} value={password} required autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD} characters`} onChange={(e) => onPassword(e.target.value)} />
          <button type="button" className="icon-btn" aria-label={show ? "Hide passwords" : "Show passwords"}
            aria-pressed={show} onClick={() => setShow(!show)}>
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </span>
      </label>
      {password && (
        <div className={`meter lvl-${level}`} aria-live="polite">
          <i /><i /><i />
          <span>{STRENGTH_LABEL[level]}</span>
        </div>
      )}
      <label>Confirm {label.toLowerCase()}
        <input type={show ? "text" : "password"} value={confirm} required autoComplete="new-password"
          placeholder="Type the same password again" aria-invalid={mismatch || undefined} onChange={(e) => onConfirm(e.target.value)} />
        {mismatch && <small className="field-error" role="alert">The two passwords do not match.</small>}
      </label>
    </>
  );
}
