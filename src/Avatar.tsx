import { initials } from "./report";
import type { Profile } from "./types";

type Props = { profile: Pick<Profile, "displayName" | "avatar"> | null | undefined; size?: "sm" | "md" | "lg" };

export default function Avatar({ profile, size = "sm" }: Props) {
  return (
    <div className={`av av-${size}`} aria-hidden="true">
      {profile?.avatar ? <img src={profile.avatar} alt="" /> : initials(profile?.displayName ?? "")}
    </div>
  );
}
