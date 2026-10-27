"use client";

/**
 * Confirms Sales surfaces stay full-bleed (no JobSidebar) — Buildertrend parity.
 * Real Sales routes use StaffShell showJobSidebar={false} (leads + materials layouts).
 */
export default function SalesNoSidebarPreviewPage() {
  return (
    <div className="flex h-screen flex-col bg-[var(--bt-page-bg)]">
      <div className="flex h-12 items-center bg-[var(--bt-nav)] px-4 text-sm font-semibold text-white">
        WCI OS · Sales (no jobs sidebar)
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Intentionally no JobSidebar — mirrors StaffShell showJobSidebar={false} */}
        <main className="flex flex-1 flex-col gap-3 p-6 text-sm text-[var(--bt-text)]">
          <h1 className="text-lg font-semibold">Lead activities</h1>
          <p className="text-[var(--bt-muted)]">
            Full-bleed under the top nav. Jobs sidebar must not appear on Sales.
          </p>
        </main>
      </div>
    </div>
  );
}
