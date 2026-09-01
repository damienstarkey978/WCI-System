/** Shared between FunUiScript (blocking init, avoids a flash of the wrong mode) and
 *  FunUiToggle (the actual switch, on the My Settings page) — same split as
 *  theme.ts, kept separate from it since dark mode and the fun-UI theme are
 *  independent choices a user can mix.
 *
 *  "Fun UI" swaps Jarvis's plain "✦" glyph for the traced mascot character
 *  (public/mascot/*.svg — a vector trace of the user's own reference art, not a
 *  redraw) wherever Jarvis appears. It's additive and reversible: no layout or
 *  copy changes, so turning it off always returns to the exact previous look.
 */
export const FUN_UI_STORAGE_KEY = "wci-fun-ui";

/** Dispatched on `window` by FunUiToggle after it flips the attribute, so already-
 *  mounted client components (JarvisLauncher, JarvisChatPanel) pick up the change
 *  immediately instead of only on next page load. */
export const FUN_UI_CHANGE_EVENT = "wci-fun-ui-change";

export type FunUiPreference = "on" | "off";

export function resolveInitialFunUi(storedValue: string | null): FunUiPreference {
  return storedValue === "on" ? "on" : "off";
}
