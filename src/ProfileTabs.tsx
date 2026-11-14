import type { ReactNode } from "react";
import { RepostIcon, ThumbUpIcon, NoteIcon } from "./icons";

export type ProfileTab = "notes" | "reposts" | "likes";
const ALL: { id: ProfileTab; label: string; icon: ReactNode }[] = [
  { id: "notes", label: "Notes", icon: <NoteIcon /> },
  { id: "reposts", label: "Reposts", icon: <RepostIcon /> },
  { id: "likes", label: "Likes", icon: <ThumbUpIcon /> },
];

/**
 * Notes / Reposts (/ Likes, on your own logbook) columns above a logbook, like the tabs on a Threads profile.
 * `children` (the sort button) sit in their own small card beside the tabs, so the button is never squeezed
 * into the tab bar and the tabs keep the whole width of their own card.
 */
export default function ProfileTabs({ tab, onChange, showLikes = false, children }: {
  tab: ProfileTab; onChange: (t: ProfileTab) => void; showLikes?: boolean; children?: ReactNode;
}) {
  const tabs = ALL.filter((t) => showLikes || t.id !== "likes");
  return (
    <div className="profile-bar">
      <div className="profile-tabs">
        <div className="profile-tablist" role="tablist" aria-label="Logbook sections">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onChange(t.id)}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
      {children ? <div className="profile-sort">{children}</div> : null}
    </div>
  );
}
