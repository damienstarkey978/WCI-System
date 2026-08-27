import type { ReactNode } from "react";

/** Shared empty-state card for job-scoped list pages that have no rows yet. */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border bg-white px-4 py-10 text-center" style={{ borderColor: "var(--bt-border)" }}>
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">{title}</h2>
      {description ? <p className="max-w-sm text-sm text-[var(--bt-muted)]">{description}</p> : null}
      {action}
    </div>
  );
}
