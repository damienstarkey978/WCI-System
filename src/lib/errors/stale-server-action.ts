/**
 * Next.js identifies a Server Action by a hash baked into the client bundle at build
 * time. A tab left open across a deploy still runs the *old* bundle, so clicking
 * anything that calls a Server Action sends the *old* hash to a server now running a
 * *new* build that doesn't recognize it — Next throws this specific error instead of
 * running anything, with "Failed to find Server Action" and a link to
 * nextjs.org/docs/messages/failed-to-find-server-action.
 *
 * Confirmed against production (2026-09-13): this reads to a user exactly like any
 * other crash, and the root error boundary's "Try again" doesn't help here — reset()
 * re-renders the same stale page, which just throws the identical error on the next
 * action. A real page reload is the only fix, so this is detected separately from
 * every other error to point at that instead. Likely explains at least some of the
 * session's earlier connection-error/403 reports too, since several deploys landed
 * while Jarvis chat and /admin/diagnostics — both long-lived pages a person can leave
 * open across a deploy — were plausibly still open in testing.
 */
export function isStaleServerActionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to find server action/i.test(error.message) || /failed-to-find-server-action/i.test(error.message);
}
