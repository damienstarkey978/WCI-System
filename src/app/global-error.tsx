"use client";

import { isStaleServerActionError } from "@/lib/errors/stale-server-action";

/**
 * Catches errors thrown by the root layout itself (error.tsx can't — it
 * renders inside the layout). Must render its own <html>/<body> since it
 * replaces the whole tree on error.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleServerActionError(error);

  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div
            style={{
              maxWidth: "32rem",
              width: "100%",
              border: stale ? "1px solid #fcd34d" : "1px solid #fca5a5",
              background: stale ? "#fffbeb" : "#fef2f2",
              borderRadius: "0.5rem",
              padding: "1.5rem",
              fontFamily: "sans-serif",
            }}
          >
            {stale ? (
              <>
                <h2 style={{ marginBottom: "0.5rem", fontSize: "1rem", fontWeight: 600 }}>This page needs a reload</h2>
                <p style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
                  A new version of WCI OS was deployed while this tab was open, so the action it just tried to run doesn&apos;t
                  exist in the version now running on the server. Reloading picks up the new version — &quot;Try again&quot;
                  won&apos;t help here, since it re-runs the same stale page instead of loading a fresh one.
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{ borderRadius: "0.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 600, color: "white", background: "#1a56db", border: "none", cursor: "pointer" }}
                >
                  Reload page
                </button>
              </>
            ) : (
              <>
                <h2 style={{ marginBottom: "0.5rem", fontSize: "1rem", fontWeight: 600 }}>Something went wrong</h2>
                <p style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>The app hit an unexpected error loading this page.</p>
                <pre style={{ marginBottom: "1rem", overflowX: "auto", background: "#fee2e2", padding: "0.75rem", borderRadius: "0.25rem", fontSize: "0.75rem" }}>
                  {error.message}
                  {error.digest ? `\n(ref: ${error.digest})` : ""}
                </pre>
                <button
                  type="button"
                  onClick={() => reset()}
                  style={{ borderRadius: "0.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 600, color: "white", background: "#1a56db", border: "none", cursor: "pointer" }}
                >
                  Try again
                </button>
              </>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
