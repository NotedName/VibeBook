export const MIN_PASSWORD = 8;

/** 0 = too short, 1 = weak, 2 = okay, 3 = strong. */
export function strength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < MIN_PASSWORD) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length >= 12 && kinds >= 3) return 3;
  return kinds >= 3 || pw.length >= 12 ? 2 : 1;
}
export const STRENGTH_LABEL = ["Use at least 8 characters", "Weak", "Okay", "Strong"] as const;

/** What is wrong with a new password typed twice ("" = fine). */
export function newPasswordProblem(password: string, confirm: string): string {
  if (password.length < MIN_PASSWORD) return `Your new password needs at least ${MIN_PASSWORD} characters.`;
  if (!confirm) return "Type your new password again to confirm it.";
  if (confirm !== password) return "The two passwords do not match.";
  return "";
}
