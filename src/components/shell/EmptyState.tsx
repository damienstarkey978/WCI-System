import type { ReactNode } from "react";

/**
 * Shared empty-state card for job-scoped list pages that have no rows yet —
 * Buildertrend's pattern: a centered icon, a bold headline, a grey description,
 * an optional "Learn How" link, and the page's real primary action button.
 * `icon` and `action` are both optional so existing callers (title/description
 * only) keep working unchanged while pages pick this up one at a time.
 */
export function EmptyState({
  icon,
  title,
  description,
  learnHowHref,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  learnHowHref?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-10 text-center" style={{ borderColor: "var(--bt-border)" }}>
      {icon ? <div className="mb-1 text-[var(--bt-muted)]">{icon}</div> : null}
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">{title}</h2>
      {description ? <p className="max-w-sm text-sm text-[var(--bt-muted)]">{description}</p> : null}
      <div className="mt-2 flex items-center gap-3">
        {learnHowHref ? (
          <a href={learnHowHref} target="_blank" rel="noreferrer" className="rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/5" style={{ borderColor: "var(--bt-border)" }}>
            Learn How
          </a>
        ) : null}
        {action}
      </div>
    </div>
  );
}
