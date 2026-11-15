import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { reactivateAccount } from "./profiles";
import { LogoMark } from "./Logo";

/** Shown instead of the app while the signed-in account is deactivated: reactivate it, or sign out. The account and its uid are untouched. */
export default function DeactivatedGate({ uid, name }: { uid: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reactivate() {
    setBusy(true); setError("");
    reactivateAccount(uid).catch(() => { setError("Could not reactivate your account. Check your connection and try again."); setBusy(false); });
  }

  return (
    <div className="page">
      <main className="logbook">
        <div className="empty deactivated-gate">
          <LogoMark />
          <h2>Your account is deactivated</h2>
          <p>{name ? `Welcome back, ${name}. ` : ""}Your profile and entries are hidden from other people. Reactivate to bring everything back exactly as it was.</p>
          {error && <p className="error note" role="alert">{error}</p>}
          <button type="button" className="btn primary" disabled={busy} onClick={reactivate}>{busy ? "Reactivating…" : "Reactivate my account"}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </main>
    </div>
  );
}
