import { initials } from "./report";
import type { Profile } from "./types";

type Props = {
  profile: Pick<Profile, "displayName" | "avatar"> | null | undefined;
  size?: "sm" | "md" | "lg";
  active?: boolean;
};

export default function Avatar({ profile, size = "sm", active = false }: Props) {
  return (
    <div className={`av av-${size}`} aria-hidden="true">
      <span className="av-in">
        {profile?.avatar ? <img src={profile.avatar} alt="" /> : initials(profile?.displayName ?? "")}
      </span>
      {active && <i className="av-dot" />}
    </div>
  );
}
