import { useEffect, useState } from "react";
import { searchProfiles } from "../profiles";
import { useSession } from "../session";
import PersonRow from "../PersonRow";
import { SearchIcon } from "../icons";

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="people-section">
      <h2>{title} <span>{count}</span></h2>
      <ul className="people">{children}</ul>
    </section>
  );
}

export default function PeoplePage() {
  const s = useSession();
  const [text, setText] = useState("");
  const [results, setResults] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = text.trim();
    if (!q) { setResults(null); setError(""); return; }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchProfiles(q, s.uid).then(
        (r) => { if (live) { setResults(r.map((p) => p.uid)); setError(""); setSearching(false); } },
        () => { if (live) { setError("Search did not work. Check your connection."); setSearching(false); } },
      );
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [text, s.uid]);

  const followingOnly = [...s.following].filter((id) => !s.friends.has(id));

  return (
    <div className="people-page">
      <h1 className="page-title">People</h1>
      <div className="search">
        <SearchIcon />
        <input type="search" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Search by name" aria-label="Search people by name" />
      </div>
      {s.error && <p className="error note" role="alert">{s.error}</p>}

      {results !== null ? (
        <section className="people-section">
          <h2>Results {searching && <span>searching…</span>}</h2>
          {error && <p className="error note">{error}</p>}
          {!searching && !error && results.length === 0 && <p className="note">No one found. Try the start of a first or last name.</p>}
          <ul className="people">{results.map((id) => <PersonRow key={id} uid={id} />)}</ul>
        </section>
      ) : (
        <>
          <Section title="Friend requests" count={s.incoming.length}>
            {s.incoming.map((r) => <PersonRow key={r.id} uid={r.from} />)}
          </Section>
          <Section title="Requests you sent" count={s.outgoing.length}>
            {s.outgoing.map((r) => <PersonRow key={r.id} uid={r.to} />)}
          </Section>
          <Section title="Friends" count={s.friends.size}>
            {[...s.friends].map((id) => <PersonRow key={id} uid={id} />)}
          </Section>
          <Section title="Following" count={followingOnly.length}>
            {followingOnly.map((id) => <PersonRow key={id} uid={id} />)}
          </Section>
          {s.friends.size + s.following.size + s.incoming.length + s.outgoing.length === 0 && (
            <div className="empty">
              <h2>Find your people</h2>
              <p>Search for classmates and coworkers by name. Add them as friends, or follow them to see what they make public.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
