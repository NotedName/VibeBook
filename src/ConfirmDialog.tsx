import { useEffect, useId, useState, type ReactNode } from "react";
import { useScrollLock } from "./scrollLock";

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** the confirm button is red (something is lost) */
  danger?: boolean;
  /** a word the person must type before the confirm button works (for actions that cannot be undone) */
  typeToConfirm?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** A centred "are you sure?" box. Cancel is the safe, first choice; Escape and a tap outside also cancel. */
export default function ConfirmDialog({ title, children, confirmLabel, cancelLabel = "Cancel", danger, typeToConfirm, onConfirm, onCancel }: Props) {
  useScrollLock();
  const id = useId();
  const [typed, setTyped] = useState("");
  const ready = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="overlay center" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <h2 id={`${id}-t`}>{title}</h2>
        <div className="confirm-body">{children}</div>
        {typeToConfirm && (
          <label className="confirm-type">Type <b>{typeToConfirm}</b> to continue
            <input value={typed} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              onChange={(e) => setTyped(e.target.value)} />
          </label>
        )}
        <div className="confirm-actions">
          <button type="button" className="btn primary" autoFocus onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={`btn${danger ? " danger" : ""}`} disabled={!ready} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
