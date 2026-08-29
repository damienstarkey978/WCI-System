/** Shared between ThemeScript (blocking init, avoids a flash of the wrong theme)
 *  and ThemeToggle (the actual switch, on the My Settings page) — kept in one place
 *  so the two never drift on the storage key or the attribute they set. */
export const THEME_STORAGE_KEY = "wci-theme";

export type ThemePreference = "light" | "dark";

/** Inlined into ThemeScript's <script> tag as a string (not imported) since that
 *  script must run standalone in the browser before any bundle loads — see
 *  ThemeScript.tsx for why. Kept here anyway as the single source of truth for the
 *  logic; ThemeScript's literal copy must be kept in sync with this. */
export function resolveInitialTheme(storedValue: string | null, prefersDark: boolean): ThemePreference {
  if (storedValue === "light" || storedValue === "dark") return storedValue;
  return prefersDark ? "dark" : "light";
}
