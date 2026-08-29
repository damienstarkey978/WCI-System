"use client";

/**
 * Catches errors thrown by the root layout itself (error.tsx can't — it
 * renders inside the layout). Must render its own <html>/<body> since it
 * replaces the whole tree on error.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
          <div style={{ maxWidth: "32rem", width: "100%", border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: "0.5rem", padding: "1.5rem", fontFamily: "sans-serif" }}>
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
          </div>
        </div>
      </body>
    </html>
  );
}
