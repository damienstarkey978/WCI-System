import { THEME_STORAGE_KEY } from "./theme";

/**
 * A blocking inline script rendered as the first child of <html>, before <body> —
 * the standard fix for "flash of wrong theme": React can't set the data-theme
 * attribute before first paint (it only runs after hydration), so this plain
 * <script> does it synchronously, before the browser paints anything. Mirrors
 * resolveInitialTheme() in theme.ts; kept as a literal string (not a call into that
 * module) because this has to run standalone, before any app bundle loads.
 */
export function ThemeScript() {
  const script = `(function(){try{var v=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var t=(v==="light"||v==="dark")?v:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
