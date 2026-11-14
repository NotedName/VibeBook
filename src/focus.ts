/**
 * Whether a sheet may put the cursor in its first field as soon as it opens. On phones and tablets that would pop the
 * keyboard up over the form (and select the field) before the person has chosen to type, so touch screens skip it.
 */
export const canAutoFocus = (): boolean =>
  typeof window === "undefined" || !window.matchMedia("(hover: none) and (pointer: coarse)").matches;
