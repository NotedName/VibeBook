import { useEffect, useState } from "react";
import { useReactors } from "./reactions";
import { useProfile } from "./session";
import { personHash } from "./profiles";
import Avatar from "./Avatar";
import { CloseIcon } from "./icons";
import { useScrollLock } from "./scrollLock";
import type { ReactionType } from "./types";

const TABS: { id: ReactionType; label: string }[] = [{ id: "vibing", label: "Vibes" }, { id: "notvibing", label: "Passes" }];

function Row({ uid, onOpen }: { uid: string; onOpen: () => void }) {
  const p = useProfile(uid);
  const name = p === undefined ? "Loading…" : p?.displayName || "Member";
  return (
    <li>
      <a className="chat-row" href={personHash(uid, p)} onClick={onOpen}>
        <Avatar profile={p} size="md" />
        <span className="chat-row-text"><b>{name}</b>{p?.username ? <span>@{p.username}</span> : null}</span>
      </a>
    </li>
  );
}

/** "View interactions" on your own entry's menu: who vibed it and who passed. */
export default function InteractionsSheet({ ownerUid, entryId, onClose }: { ownerUid: string; entryId: string; onClose: () => void }) {
  useScrollLock();
  const { list, error } = useReactors(ownerUid, entryId);
  const [tab, setTab] = useState<ReactionType>("vibing");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const count = (t: ReactionType) => (list ?? []).filter((r) => r.type === t).length;
  const shown = (list ?? []).filter((r) => r.type === tab);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Interactions">
        <div className="sheet-head">
          <h2>Interactions</h2>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="sheet-body">
          <div className="seg interactions-tabs" role="tablist" aria-label="Interaction type">
            {TABS.map((t) => (
              <label key={t.id} className={tab === t.id ? "on" : ""}>
                <input type="radio" name="interaction" checked={tab === t.id} onChange={() => setTab(t.id)} />{t.label} · {count(t.id)}
              </label>
            ))}
          </div>
          {error && <p className="error" role="alert">Could not load interactions. Check your connection.</p>}
          {list === null && !error && <p className="hint">Loading…</p>}
          {list !== null && shown.length === 0 && <p className="hint">{tab === "vibing" ? "No one has vibed this entry yet." : "No one has passed on this entry."}</p>}
          <ul className="people chat-list">{shown.map((r) => <Row key={r.uid} uid={r.uid} onOpen={onClose} />)}</ul>
        </div>
      </div>
    </div>
  );
}
