import type { ReactNode } from "react";
import { RepostIcon, ThumbUpIcon, NoteIcon } from "./icons";

export type ProfileTab = "notes" | "reposts" | "likes";
const ALL: { id: ProfileTab; label: string; icon: ReactNode }[] = [
  { id: "notes", label: "Notes", icon: <NoteIcon /> },
  { id: "reposts", label: "Reposts", icon: <RepostIcon /> },
  { id: "likes", label: "Likes", icon: <ThumbUpIcon /> },
];

/** Notes / Reposts (/ Likes, on your own logbook) columns above a logbook, like the tabs on a Threads profile. */
export default function ProfileTabs({ tab, onChange, showLikes = false }: {
  tab: ProfileTab; onChange: (t: ProfileTab) => void; showLikes?: boolean;
}) {
  const tabs = ALL.filter((t) => showLikes || t.id !== "likes");
  return (
    <div className="profile-tabs" role="tablist" aria-label="Logbook sections">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onChange(t.id)}>
          {t.icon}<span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
