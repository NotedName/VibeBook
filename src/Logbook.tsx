import { useEffect, useState } from "react";
import { signOut, type User } from "firebase/auth";
import { onSnapshot, orderBy, query } from "firebase/firestore";
import { auth } from "./firebase";
import { entriesRef, type Entry } from "./entries";
import EntryForm from "./EntryForm";
import EntryCard from "./EntryCard";

export default function Logbook({ user }: { user: User }) {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(
    () =>
      onSnapshot(query(entriesRef(user.uid), orderBy("date", "desc")), (snap) =>
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry)),
      ),
    [user.uid],
  );

  return (
    <main className="logbook">
      <header>
        <h1>OJT Logbook</h1>
        <button className="link" onClick={() => signOut(auth)}>Sign out</button>
      </header>
      <EntryForm uid={user.uid} />
      {entries.length === 0 && <p className="empty">No entries yet. Post your first activity above.</p>}
      {entries.map((e) => <EntryCard key={e.id} uid={user.uid} entry={e} />)}
    </main>
  );
}
