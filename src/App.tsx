import { FeedSkeleton, ProfileSkeleton } from "./Skeleton";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";
import AuthForm from "./AuthForm";
import VerifyEmail from "./VerifyEmail";
import Shell from "./Shell";
import PublicPost from "./PublicPost";
import { parsePostHash } from "./share";
import { hideSplash } from "./splash";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [, setVerifiedTick] = useState(0);
  const [hash, setHash] = useState(() => location.hash);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | null>(null);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    const onHash = () => setHash(location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // user.reload() updates the same User object in place, so React needs a nudge to re-render.
  const onVerified = useCallback(() => setVerifiedTick((n) => n + 1), []);
  // The splash stays until there is something real behind it. Signed-in people see the logbook, so Shell
  // hides it once their profile has loaded; every other screen (sign in, verify email) can show right away.
  useEffect(() => {
    if (user !== undefined && !(user && user.emailVerified)) hideSplash();
  }, [user]);

  // Until auth answers, the splash screen from index.html is showing; this line is only a fallback.
  if (user === undefined) return <div className="page"><main className="logbook"><ProfileSkeleton /><FeedSkeleton /></main></div>;
  if (!user) {
    // A share link shows the post read-only; the visitor has to sign in for anything more.
    const post = parsePostHash(hash);
    if (post && !authMode) return <PublicPost uid={post.uid} id={post.id} onAuth={setAuthMode} />;
    return <AuthForm key={authMode ?? "signin"} initialMode={authMode ?? "signin"} onBack={post ? () => setAuthMode(null) : undefined} />;
  }
  if (!user.emailVerified) return <VerifyEmail user={user} onVerified={onVerified} />;
  return <Shell key={user.uid} user={user} />;
}
