import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useSession } from "./session";
import type { Audience } from "./types";

/**
 * Whether you may see something its owner shares with an audience (Settings > Privacy). firestore.rules is what really
 * enforces it; this only decides what to draw, and whether to ask at all.
 *
 * Friends of friends needs proof the rules can check, because they cannot search friendships. So the first time you open
 * the profile of someone you are not friends with, we look for one of your friends who has them in their friend list and
 * save that friend as users/{me}/reach/{owner}. The rules then check that friend against both live friendships on every read.
 */
const reached = new Map<string, Promise<boolean>>();

function findReach(me: string, owner: string, friends: Set<string>, key: string): Promise<boolean> {
  let p = reached.get(key);
  if (!p) {
    p = (async () => {
      const hits = await Promise.all([...friends].map(async (f) => {
        // A friend who keeps their own friend list to themselves cannot connect you: the read is denied, which means "no".
        try { return (await getDoc(doc(db, "users", f, "friendList", owner))).exists() ? f : null; } catch { return null; }
      }));
      const via = hits.find((f) => f !== null);
      if (!via) return false;
      await setDoc(doc(db, "users", me, "reach", owner), { via });
      return true;
    })();
    p.catch(() => reached.delete(key));
    reached.set(key, p);
  }
  return p;
}

/** true / false, or undefined while a friends-of-friends answer is still being looked up. For your own uid it answers as a stranger would. */
export function useCanSee(owner: string, audience: Audience): boolean | undefined {
  const s = useSession();
  const friendsKey = [...s.friends].sort().join(",");
  const needsReach = audience === "fof" && owner !== s.uid && !s.friends.has(owner);
  const [reach, setReach] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!needsReach) return;
    setReach(undefined);
    let live = true;
    findReach(s.uid, owner, s.friends, `${s.uid}>${owner}:${friendsKey}`).then((r) => live && setReach(r), () => live && setReach(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsReach, s.uid, owner, friendsKey]);
  if (audience === "everyone") return true;
  if (audience === "private") return false;
  if (s.friends.has(owner)) return true;
  return audience === "fof" ? (needsReach ? reach : false) : false;
}
