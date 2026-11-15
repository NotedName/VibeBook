import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useSession } from "./session";
import Avatar from "./Avatar";
import { forgetAccount, rememberAccount, setLoginHint, useKnownAccounts } from "./accounts";
import { initials } from "./report";
import { BookIcon, CloseIcon, LogOutIcon, PlusIcon } from "./icons";

/**
 * The profile picture in the top bar. It opens a dropdown (not a dialog): who you are, View logbook, the other accounts used on this
 * device, Add account and Sign out. Switching accounts signs out and fills in that account's email on the sign-in screen, because the
 * password is never stored. The dropdown is drawn on the page itself so the side rail on tablets cannot clip it.
 */
export default function AccountMenu() {
  const { me, user } = useSession();
  const email = user.email ?? "";
  const accounts = useKnownAccounts();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Remember this account for next time (name and email only).
  useEffect(() => {
    if (me?.displayName && email) rememberAccount({ uid: user.uid, email, name: me.displayName });
  }, [me?.displayName, email, user.uid]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); button.current?.focus(); } };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function toggle() {
    if (open) return setOpen(false);
    const r = button.current?.getBoundingClientRect();
    if (r) {
      // In the top bar the menu hangs below the picture, lined up with its right edge. In the side rail (the picture sits at the
      // left) it opens beside the rail, with its bottom at the picture's.
      setPos(r.left < window.innerWidth / 2
        ? { left: r.right + 10, bottom: Math.max(8, window.innerHeight - r.bottom) }
        : { top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen(true);
  }

  const others = accounts.filter((a) => a.uid !== user.uid);
  const leave = (hint: string) => { setLoginHint(hint); setOpen(false); signOut(auth); };

  return (
    <>
      <button ref={button} type="button" className="icon-btn avatar-btn" onClick={toggle}
        aria-label="Account" aria-haspopup="menu" aria-expanded={open}>
        <Avatar profile={me} />
      </button>
      {open && createPortal(
        <div ref={menu} className="menu acct-menu" role="menu" aria-label="Account" style={pos}>
          <div className="acct-who">
            <Avatar profile={me} size="md" />
            <div className="who-text">
              <b className="account-name">{me?.displayName}</b>
              <span className="hint">{email}</span>
            </div>
          </div>
          <a role="menuitem" className="menu-link" href="#/me" onClick={() => setOpen(false)}><BookIcon />View logbook</a>
          {others.length > 0 && (
            <>
              <span className="menu-title">Switch account</span>
              {others.map((a) => (
                <div key={a.uid} className="acct-row">
                  <button type="button" role="menuitem" onClick={() => leave(a.email)} title={`Sign in as ${a.email}`}>
                    <i className="acct-dot" aria-hidden="true">{initials(a.name)}</i>
                    <span className="acct-text"><b>{a.name}</b><small>{a.email}</small></span>
                  </button>
                  <button type="button" className="acct-x" aria-label={`Remove ${a.name} from this device`} title="Remove from this device"
                    onClick={() => forgetAccount(a.uid)}><CloseIcon /></button>
                </div>
              ))}
              <p className="menu-note">Switching signs you out and asks for that account's password.</p>
            </>
          )}
          <button type="button" role="menuitem" onClick={() => leave("")}><PlusIcon />Add account</button>
          <button type="button" role="menuitem" onClick={() => leave("")}><LogOutIcon />Sign out</button>
        </div>,
        document.body,
      )}
    </>
  );
}
