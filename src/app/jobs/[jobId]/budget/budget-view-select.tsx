"use client";

import { useRouter } from "next/navigation";

/** Buildertrend shows the Standard/Job costing/Client pricing/Profit choice as a "View" dropdown, not a tab row. */
export function BudgetViewSelect({
  jobId,
  views,
  selectedKey,
}: {
  jobId: string;
  views: readonly { key: string; label: string }[];
  selectedKey: string;
}) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-[var(--bt-muted)]">View:</span>
      <select
        value={selectedKey}
        onChange={(event) => router.push(`/jobs/${jobId}/budget?view=${event.target.value}`)}
        className="rounded border px-2.5 py-1.5 text-sm font-medium outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {views.map((view) => (
          <option key={view.key} value={view.key}>
            {view.label}
          </option>
        ))}
      </select>
    </label>
  );
}
