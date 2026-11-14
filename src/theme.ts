import { useCallback, useState } from "react";

type Theme = "light" | "dark";
const KEY = "vibebook-theme";

function current(): Theme {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Light/dark toggle. The page starts dark (the palette's home) unless the device asks for light. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(current);
  const toggle = useCallback(() => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "light" ? "#f3f2f5" : "#1e1c23");
    setTheme(next);
  }, []);
  return [theme, toggle];
}
