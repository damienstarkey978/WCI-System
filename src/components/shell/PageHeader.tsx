import type { ReactNode } from "react";

/**
 * Buildertrend's page header: a small grey job-name line above the bold page
 * title, with a right-aligned slot for the primary create button (and any
 * secondary actions). Used by every job-scoped page.
 */
export function PageHeader({ jobName, title, action }: { jobName: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-xs text-[var(--bt-muted)]">{jobName}</div>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">{title}</h1>
      </div>
      {action}
    </div>
  );
}
