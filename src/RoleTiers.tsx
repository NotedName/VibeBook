import type { ReactNode } from "react";
import { roleTiers } from "./groups";
import type { Member } from "./types";

/**
 * A group's members laid out by rank: Owner, then Admins, Moderators and Members, each under its own small heading with a count.
 * `list` is the class of each tier's <ul>, and `render` draws one row. The rank is shown by the heading, so rows need no role badge.
 */
export default function RoleTiers<T extends Member>({ members, ownerUid, list, render }: {
  members: T[]; ownerUid: string; list: string; render: (m: T) => ReactNode;
}) {
  return (
    <div className="role-tiers">
      {roleTiers(members, ownerUid).map((t) => (
        <section key={t.id} className={`role-tier tier-${t.id}`} aria-label={t.label}>
          <h3 className="tier-head">{t.label}<span>{t.members.length}</span></h3>
          <ul className={list}>{t.members.map(render)}</ul>
        </section>
      ))}
    </div>
  );
}
