"use client";

import { isStaleServerActionError } from "@/lib/errors/stale-server-action";

/**
 * Root error boundary. Without this, any uncaught render/server-action error
 * anywhere under the app falls through to Next's bare default error page —
 * which reads to a user as the feature silently doing nothing, not as a bug
 * report. This at least names the failure and offers a way back.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (isStaleServerActionError(error)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950">
          <h2 className="mb-2 text-base font-semibold">This page needs a reload</h2>
          <p className="mb-4">
            The action this tab just tried didn&apos;t match the version of WCI OS running on the server (a deploy landed
            while the tab was open, or the server returned an incomplete reply). Reloading picks up a fresh page —
            &quot;Try again&quot; won&apos;t help here, since it re-runs the same stale tab instead of loading a new one.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--bt-primary, #1a56db)" }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-950">
        <h2 className="mb-2 text-base font-semibold">Something went wrong</h2>
        <p className="mb-4">This page hit an unexpected error. You can try again, or reload the page.</p>
        <pre className="mb-4 overflow-x-auto rounded bg-red-100 p-3 font-mono text-xs">
          {error.message}
          {error.digest ? `\n(ref: ${error.digest})` : ""}
        </pre>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
          style={{ background: "var(--bt-primary, #1a56db)" }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
