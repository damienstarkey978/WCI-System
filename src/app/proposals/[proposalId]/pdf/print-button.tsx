"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded px-4 py-2 text-sm font-semibold text-white"
      style={{ background: "#0f172a" }}
    >
      Print / Save as PDF
    </button>
  );
}
