import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";
import AuthForm from "./AuthForm";
import Logbook from "./Logbook";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <p className="center">Loading…</p>;
  return user ? <Logbook user={user} /> : <AuthForm />;
}
