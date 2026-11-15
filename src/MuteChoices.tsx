import { CheckIcon, ClockIcon } from "./icons";
import { MUTE_FOREVER, type ChatPrefs } from "./messages";
import { MUTE_CHOICES, muteLabel } from "./chatCommands";

/** The list of times a chat can be muted for. If it is muted already, the first row says until when and turns it back on. */
export default function MuteChoices({ prefs, muted, onPick, onUnmute }: {
  prefs: ChatPrefs; muted: boolean; onPick: (ms: number) => void; onUnmute: () => void;
}) {
  return (
    <div className="action-list" role="group" aria-label="Mute notifications">
      <p className="hint action-hint">Messages still arrive, but this chat is left out of the unread count in the top bar.</p>
      {muted && (
        <button type="button" className="action-row on" onClick={onUnmute}>
          <i><CheckIcon /></i>
          <span>Unmute<small>{prefs.mutedUntil > 0 && prefs.mutedUntil < MUTE_FOREVER ? muteLabel(prefs.mutedUntil) : "Muted until you turn it back on"}</small></span>
        </button>
      )}
      {MUTE_CHOICES.map((c) => (
        <button key={c.ms} type="button" className="action-row" onClick={() => onPick(c.ms)}>
          <i><ClockIcon /></i><span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}
