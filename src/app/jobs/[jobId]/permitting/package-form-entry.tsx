"use client";

import type { ReactNode } from "react";

/**
 * Step D chrome: per-form 1/N navigation matching Rockstar
 * Back / Main Menu / Update Document / Next / Finish.
 */
export function PackageFormEntryNav({
  formIndex,
  formCount,
  formTitle,
  onBack,
  onNext,
  onMainMenu,
  updateSlot,
  downloadSlot,
}: {
  readonly formIndex: number;
  readonly formCount: number;
  readonly formTitle: string;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly onMainMenu: () => void;
  readonly updateSlot?: ReactNode;
  readonly downloadSlot?: ReactNode;
}) {
  const atStart = formIndex <= 0;
  const atEnd = formIndex >= formCount - 1;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--bt-text)]">{formTitle}</h3>
        <span className="text-[11px] font-medium text-[var(--bt-muted)]">
          Form {formCount === 0 ? 0 : formIndex + 1} / {formCount}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={atStart}
          onClick={onBack}
          className="rounded border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40"
          style={{ borderColor: "var(--bt-border)" }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onMainMenu}
          className="rounded border px-2.5 py-1.5 text-xs font-semibold"
          style={{ borderColor: "var(--bt-border)" }}
        >
          Main Menu
        </button>
        {updateSlot}
        {downloadSlot}
        {atEnd ? (
          <button
            type="button"
            onClick={onMainMenu}
            className="rounded px-2.5 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)]"
            style={{ background: "var(--bt-primary)" }}
          >
            Finish
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="rounded px-2.5 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)]"
            style={{ background: "var(--bt-primary)" }}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
