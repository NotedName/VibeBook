export type EmojiCategory = { label: string; icon: string; emojis: string[] };

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { label: "Smileys", icon: "😀", emojis: [
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘",
    "😋", "😜", "🤪", "🤔", "🤨", "😐", "😑", "😶", "🙄", "😏", "😌", "😴", "🥱", "😮", "😯", "😲",
    "🥹", "😢", "😭", "😤", "😠", "🤯", "😳", "🥵", "🥶", "😱", "😅", "🤗", "🫡", "🫠", "😎", "🤓"] },
  { label: "Gestures", icon: "👍", emojis: [
    "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "👌", "✌️", "🤞", "🤟", "🤘", "👋", "🤙", "👆", "👇",
    "👉", "👈", "✍️", "🫶", "🫡", "🤲", "👀", "🧠"] },
  { label: "Work", icon: "💻", emojis: [
    "💻", "🖥️", "⌨️", "🖱️", "🖨️", "📱", "🔌", "🔋", "💾", "🛠️", "🔧", "🔨", "⚙️", "🧰", "🔬", "📡",
    "📈", "📊", "📋", "📝", "📎", "📌", "📅", "🗂️", "📁", "✉️", "📞", "🎧", "💡", "🔍", "🔒", "🔑"] },
  { label: "Progress", icon: "🚀", emojis: [
    "🚀", "✅", "☑️", "✔️", "❌", "⚠️", "🚧", "🐛", "🎯", "🏆", "🥇", "⭐", "🌟", "✨", "⚡", "🔥",
    "💯", "🎉", "🎊", "🏁", "⏳", "⏰", "📣", "🔔"] },
  { label: "Hearts", icon: "❤️", emojis: [
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💗", "💕", "💞", "💔", "❣️", "💘", "💝"] },
  { label: "Food", icon: "☕", emojis: [
    "☕", "🍵", "🧋", "🥤", "🍕", "🍔", "🍟", "🌭", "🌮", "🍜", "🍣", "🍱", "🍙", "🍚", "🍝", "🥪",
    "🍩", "🍪", "🍰", "🍫", "🍎", "🍌", "🍇", "🥑"] },
  { label: "Nature", icon: "🌈", emojis: [
    "🌈", "☀️", "🌤️", "⛅", "🌧️", "⛈️", "❄️", "🌙", "🌸", "🌺", "🌻", "🌴", "🌱", "🍀", "🐶", "🐱",
    "🐼", "🦊", "🐢", "🦋", "🐝", "🌊", "🌍", "⛰️"] },
];

/** The text field an emoji goes into, and what it becomes once inserted. */
type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Inserts an emoji at the cursor (or replaces the selection) and puts the cursor after it.
 * Does nothing when it would pass `max`.
 */
export function insertEmoji(field: Field | null, value: string, emoji: string, setValue: (v: string) => void, max?: number) {
  const start = field?.selectionStart ?? value.length;
  const end = field?.selectionEnd ?? start;
  const next = value.slice(0, start) + emoji + value.slice(end);
  if (max !== undefined && next.length > max) return;
  setValue(next);
  const caret = start + emoji.length;
  requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(caret, caret); });
}
