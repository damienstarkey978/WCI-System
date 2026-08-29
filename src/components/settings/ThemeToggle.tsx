"use client";

import { useState } from "react";

import { resolveInitialTheme, THEME_STORAGE_KEY, type ThemePreference } from "./theme";

/** The actual dark-mode switch, on the My Settings page (src/app/settings/page.tsx).
 *  ThemeScript.tsx handles the flash-free initial paint; this just lets the user
 *  change and persist their choice from then on. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "light";
    return resolveInitialTheme(localStorage.getItem(THEME_STORAGE_KEY), window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  function setThemePreference(next: ThemePreference) {
    setTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-[var(--bt-text)]">Dark mode</p>
        <p className="text-xs text-[var(--bt-muted)]">Switch the whole app to a dark color scheme.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={theme === "dark"}
        onClick={() => setThemePreference(theme === "dark" ? "light" : "dark")}
        className="relative h-6 w-11 shrink-0 rounded-full transition"
        style={{ background: theme === "dark" ? "var(--bt-primary)" : "var(--bt-border)" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
          style={{ left: theme === "dark" ? "1.375rem" : "0.125rem" }}
        />
      </button>
    </div>
  );
}
