import { FUN_UI_STORAGE_KEY } from "./fun-ui";

/**
 * Same "flash of wrong state" fix as ThemeScript.tsx, for the fun-UI toggle — a
 * blocking inline script, rendered before <body>, that sets data-fun-ui on <html>
 * synchronously so mascot-aware components never paint the wrong mode on first
 * render. Mirrors resolveInitialFunUi() in fun-ui.ts; keep the two in sync.
 */
export function FunUiScript() {
  const script = `(function(){try{var v=localStorage.getItem(${JSON.stringify(FUN_UI_STORAGE_KEY)});document.documentElement.setAttribute("data-fun-ui",v==="on"?"on":"off");}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
