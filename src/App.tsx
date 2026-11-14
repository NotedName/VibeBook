import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";
import AuthForm from "./AuthForm";
import VerifyEmail from "./VerifyEmail";
import Shell from "./Shell";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [, setVerifiedTick] = useState(0);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  // user.reload() updates the same User object in place, so React needs a nudge to re-render.
  const onVerified = useCallback(() => setVerifiedTick((n) => n + 1), []);

  if (user === undefined) return <p className="center">Loading…</p>;
  if (!user) return <AuthForm />;
  if (!user.emailVerified) return <VerifyEmail user={user} onVerified={onVerified} />;
  return <Shell key={user.uid} user={user} />;
}
