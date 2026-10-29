import { EscapeMenusFixture } from "./escape-menus-client";

export const dynamic = "force-dynamic";

/** Visual fixture for Escape-to-close header menus (Heather Oct 28 leftover). No DB. */
export default function EscapeMenusDevPage() {
  return (
    <div className="min-h-screen bg-[var(--bt-page-bg,#f5f5f5)] p-6 text-[var(--bt-text,#111)]">
      <h1 className="text-xl font-semibold">Escape menus fixture</h1>
      <p className="mt-1 text-sm text-[var(--bt-muted,#666)]">Open a menu, press Escape — it should close. No auth / DB required.</p>
      <div className="mt-6">
        <EscapeMenusFixture />
      </div>
    </div>
  );
}
