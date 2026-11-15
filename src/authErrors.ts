const WRONG_LOGIN = "The email or password is incorrect. Check them and try again.";

const MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "An account with this email already exists. Try signing in instead.",
  "auth/invalid-email": "That email address does not look right.",
  "auth/weak-password": "Choose a stronger password: at least 8 characters.",
  // Firebase reports a wrong password, an unknown email and a wrong email with different codes depending on its version and
  // settings. They all say the same thing here, which also does not reveal whether an account exists.
  "auth/invalid-credential": WRONG_LOGIN,
  "auth/invalid-login-credentials": WRONG_LOGIN,
  "auth/wrong-password": WRONG_LOGIN,
  "auth/user-not-found": WRONG_LOGIN,
  "auth/missing-password": "Enter your password.",
  "auth/missing-email": "Enter your email address.",
  "auth/user-disabled": "This account has been disabled. Contact support if you think this is a mistake.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
  "auth/requires-recent-login": "For your security, sign in again and then retry.",
  "auth/popup-closed-by-user": "The sign-in window was closed before it finished.",
  "auth/expired-action-code": "This link has expired. Request a new one and try again.",
  "auth/invalid-action-code": "This link is not valid or was already used. Request a new one and try again.",
  "auth/operation-not-allowed": "This way of signing in is not turned on yet.",
};

/** Turns whatever went wrong into a sentence for the person. The raw "Firebase: Error (auth/...)" text is never shown. */
export function authMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code.startsWith("auth/")) return MESSAGES[code] ?? "Something went wrong signing you in. Try again.";
  const text = err instanceof Error ? err.message : "";
  // an error of ours (not Firebase's) already reads as a sentence
  if (text && !/firebase|\(auth\//i.test(text)) return text;
  return "Something went wrong. Try again.";
}
