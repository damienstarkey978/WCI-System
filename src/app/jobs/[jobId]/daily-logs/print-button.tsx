"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} aria-label="Print" className="rounded border px-3 py-2 text-sm font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
      Print
    </button>
  );
}
