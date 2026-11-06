"use client";

/** Outlined Print control — matches ListToolbar secondary chrome. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      aria-label="Print"
      className="inline-flex h-9 items-center rounded border bg-[var(--bt-panel-bg)] px-3 text-sm font-medium text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg-muted)]"
      style={{ borderColor: "var(--bt-border)" }}
    >
      Print
    </button>
  );
}
