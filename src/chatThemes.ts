import type { CSSProperties } from "react";

/** Chat themes: one colour that tints the chat background and your message bubbles. Both people see the same one, as in Messenger. */
export type ChatTheme = { id: string; label: string; color: string };
export const CHAT_THEMES: ChatTheme[] = [
  { id: "default", label: "Default", color: "" },
  { id: "violet", label: "Violet", color: "#7c4dff" },
  { id: "ocean", label: "Ocean", color: "#1e88e5" },
  { id: "teal", label: "Teal", color: "#00897b" },
  { id: "forest", label: "Forest", color: "#43a047" },
  { id: "gold", label: "Gold", color: "#f9a825" },
  { id: "sunset", label: "Sunset", color: "#fb8c00" },
  { id: "crimson", label: "Crimson", color: "#e53935" },
  { id: "rose", label: "Rose", color: "#d81b60" },
  { id: "berry", label: "Berry", color: "#8e24aa" },
  { id: "slate", label: "Slate", color: "#546e7a" },
];
export const themeOf = (id: string): ChatTheme => CHAT_THEMES.find((t) => t.id === id) ?? CHAT_THEMES[0];
/** The CSS variable that .chat-themed (material.css) reads; undefined for the default theme. */
export const themeStyle = (id: string): CSSProperties | undefined => {
  const t = themeOf(id);
  return t.color ? ({ "--chat-accent": t.color } as CSSProperties) : undefined;
};
