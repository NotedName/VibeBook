import { useEffect, useState } from "react";
import { discoverGroups, searchGroups } from "../groups";
import { useSession } from "../session";
import type { Group } from "../types";
import GroupRow from "../GroupRow";
import GroupSheet from "../GroupSheet";
import { PlusIcon, SearchIcon } from "../icons";

export default function GroupsPage() {
  const s = useSession();
  const [text, setText] = useState("");
  const [results, setResults] = useState<Group[] | null>(null);
  const [discover, setDiscover] = useState<Group[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let live = true;
    discoverGroups().then(
      (g) => live && setDiscover(g),
      () => live && setError("Could not load groups. Check your connection."),
    );
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const q = text.trim();
    if (!q) { setResults(null); return; }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchGroups(q).then(
        (r) => { if (live) { setResults(r); setError(""); setSearching(false); } },
        () => { if (live) { setError("Search did not work. Check your connection."); setSearching(false); } },
      );
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [text]);

  const others = (discover ?? []).filter((g) => !s.groups.ids.has(g.id));

  return (
    <div className="people-page">
      <div className="title-row">
        <h1 className="page-title">Groups</h1>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}><PlusIcon /> New group</button>
      </div>
      <div className="search">
        <SearchIcon />
        <input type="search" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Search groups by name" aria-label="Search groups by name" />
      </div>
      {(s.groups.error || error) && <p className="error note" role="alert">{s.groups.error || error}</p>}

      {results !== null ? (
        <section className="people-section">
          <h2>Results {searching && <span>searching…</span>}</h2>
          {!searching && !error && results.length === 0 && <p className="note">No groups found. Try the start of a word in its name.</p>}
          <ul className="people">{results.map((g) => <GroupRow key={g.id} group={g} />)}</ul>
        </section>
      ) : (
        <>
          {s.groups.list.length > 0 && (
            <section className="people-section">
              <h2>Your groups <span>{s.groups.list.length}</span></h2>
              <ul className="people">{s.groups.list.map((g) => <GroupRow key={g.id} group={g} />)}</ul>
            </section>
          )}
          {others.length > 0 && (
            <section className="people-section">
              <h2>Discover</h2>
              <ul className="people">{others.map((g) => <GroupRow key={g.id} group={g} />)}</ul>
            </section>
          )}
          {s.groups.ready && s.groups.list.length === 0 && discover !== null && others.length === 0 && (
            <div className="empty">
              <h2>No groups yet</h2>
              <p>Start one for your class, your office or your team, then share entries with just them.</p>
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>Create the first group</button>
            </div>
          )}
        </>
      )}

      {creating && (
        <GroupSheet
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); s.notify("Group created"); location.hash = `#/g/${encodeURIComponent(id)}`; }}
        />
      )}
    </div>
  );
}
