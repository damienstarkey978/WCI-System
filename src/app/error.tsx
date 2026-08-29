"use client";

/**
 * Root error boundary. Without this, any uncaught render/server-action error
 * anywhere under the app falls through to Next's bare default error page —
 * which reads to a user as the feature silently doing nothing, not as a bug
 * report. This at least names the failure and offers a way back.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
          className="rounded px-4 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--bt-primary, #1a56db)" }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
