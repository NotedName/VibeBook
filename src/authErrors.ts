import { FirebaseError } from "firebase/app";

const MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "An account with this email already exists. Try signing in instead.",
  "auth/invalid-email": "That email address does not look right.",
  "auth/weak-password": "Choose a stronger password: at least 8 characters.",
  "auth/invalid-credential": "The email or password is incorrect.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
};

export function authMessage(err: unknown): string {
  if (err instanceof FirebaseError) return MESSAGES[err.code] ?? err.message;
  return (err as Error).message;
}
