import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import type { Entry } from "./entries";
import type { MyGroups } from "./groups";
import { fetchProfile } from "./profiles";
import type { Repost } from "./reposts";
import type { SocialState } from "./social";
import type { GroupInvite, Profile } from "./types";

export type Session = SocialState & {
  user: User;
  uid: string;
  /** undefined while loading, null when the person has not made a profile yet */
  me: Profile | null | undefined;
  groups: MyGroups;
  /** invitations to groups you have not joined yet */
  invites: GroupInvite[];
  /** entries you have reposted, by "<ownerUid>_<entryId>" */
  reposts: Map<string, Repost>;
  notify: (message: string) => void;
  manualCopy: (text: string) => void;
  editProfile: () => void;
  /** entry null = new entry; groupId pre-selects a group to share a new entry with. */
  openEntry: (entry: Entry | null, groupId?: string) => void;
};

const Ctx = createContext<Session | null>(null);
export const SessionProvider = Ctx.Provider;

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

/** Profile for any uid. Your own is live; others are fetched once and cached. */
export function useProfile(uid: string | undefined): Profile | null | undefined {
  const s = useSession();
  const [other, setOther] = useState<Profile | null | undefined>(undefined);
  useEffect(() => {
    if (!uid || uid === s.uid) return;
    let live = true;
    setOther(undefined);
    fetchProfile(uid).then((p) => live && setOther(p), () => live && setOther(null));
    return () => { live = false; };
  }, [uid, s.uid]);
  if (!uid) return null;
  return uid === s.uid ? s.me : other;
}
