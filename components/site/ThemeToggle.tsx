"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "@phosphor-icons/react";

type Theme = "light" | "dark";

/**
 * Writes `data-theme` on <html> and remembers the choice. The initial value is
 * applied by the inline script in app/layout.tsx before first paint; this
 * component only reads back what is already there, so there is no flash and no
 * hydration mismatch.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // The active theme only exists on the client — it comes from localStorage
    // (applied by the inline script in the document head) or from the OS
    // preference. The server cannot know either, so this reads it once after
    // mount; the single follow-up render is the point, not a cascade.
    const attr = document.documentElement.getAttribute("data-theme");
    const resolved: Theme =
      attr === "dark" || attr === "light"
        ? attr
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(resolved);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("odd-theme", next);
    } catch {
      // Private mode: the toggle still works for this page view.
    }
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      // Before the effect runs we do not know the theme; keep the control
      // present so the header does not reflow, but out of the tab order.
      aria-hidden={theme === null}
      tabIndex={theme === null ? -1 : 0}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {isDark ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
    </button>
  );
}
