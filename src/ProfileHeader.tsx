import type { ReactNode } from "react";
import type { Profile } from "./types";
import Avatar from "./Avatar";

export default function ProfileHeader({ profile, children }: { profile: Profile; children?: ReactNode }) {
  return (
    <section className="profile" aria-label="Profile">
      <div className={`cover c-${profile.cover}`} aria-hidden="true" />
      <div className="pad">
        <div className="who">
          <Avatar profile={profile} size="lg" />
          <div className="who-text">
            <h1 className="name">{profile.displayName}</h1>
            {profile.headline && <div className="role">{profile.headline}</div>}
          </div>
        </div>
        {(profile.workplace || profile.bio) && (
          <div className="about">
            {profile.workplace && <div className="workplace">{profile.workplace}</div>}
            {profile.bio && <p>{profile.bio}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
