/**
 * UI-level feature flags — distinct from src/lib/env.ts's integration checks
 * (isAnthropicConfigured() etc.), which gate whether a backend capability works at
 * all. A flag here only ever hides or shows UI; it never changes what the backend
 * can do, and nothing that reads one of these flags should also skip a real
 * capability check.
 */

/**
 * Jarvis's chat panels, the floating launcher bubble, and every other AI-styled
 * mount point are hidden by default while WCI OS does a UI/UX parity pass against
 * Buildertrend — a Jarvis panel inlined into a page is one of the biggest reasons a
 * page doesn't match Buildertrend's real layout yet. Every Jarvis route, API,
 * worker, model, and the proposal-draft pipeline stay fully intact; this only
 * controls whether the UI mounts, so turning it back on later needs no code
 * changes. Public env var (not a plain env.ts check) so client components can read
 * it directly without a prop threaded down from a server component.
 */
export function isJarvisUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JARVIS_UI_ENABLED === "true";
}
