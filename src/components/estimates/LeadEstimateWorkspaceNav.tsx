/**
 * Left rail for the Handoff-like three-panel estimate workspace.
 * Project/lead context + estimate list — not a jobs sidebar.
 */

import Link from "next/link";

export type WorkspaceEstimateLink = {
  readonly id: string;
  readonly title: string;
  readonly totalLabel: string;
  readonly status: string;
  readonly proposalId: string | null;
  readonly active: boolean;
};

export function LeadEstimateWorkspaceNav({
  leadId,
  leadName,
  leadTitle,
  estimates,
  activeKind,
}: {
  readonly leadId: string;
  readonly leadName: string;
  readonly leadTitle: string | null;
  readonly estimates: readonly WorkspaceEstimateLink[];
  readonly activeKind: "estimate" | "proposal";
}) {
  return (
    <aside
      className="flex w-full shrink-0 flex-col gap-3 rounded-xl border p-3 lg:sticky lg:top-2 lg:w-[13.5rem] lg:self-start xl:w-[15rem]"
      style={{
        borderColor: "var(--bt-border)",
        background: "var(--bt-panel-bg)",
        maxHeight: "calc(100vh - 5rem)",
      }}
    >
      <div className="min-w-0">
        <Link
          href={`/leads/${leadId}?tab=proposals&compose=1`}
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--bt-muted)] hover:text-[var(--bt-primary)] hover:underline"
        >
          ← All proposals
        </Link>
        <p className="mt-1 truncate text-sm font-semibold text-[var(--bt-text)]">{leadTitle ?? leadName}</p>
        <p className="truncate text-xs text-[var(--bt-muted)]">{leadName}</p>
      </div>

      <nav className="flex flex-col gap-0.5" aria-label="Lead estimate workspace">
        <Link
          href={`/leads/${leadId}`}
          className="rounded-md px-2.5 py-2 text-xs font-medium text-[var(--bt-muted)] hover:bg-[var(--bt-panel-bg-muted)] hover:text-[var(--bt-text)]"
        >
          Overview
        </Link>
        <span
          className="rounded-md px-2.5 py-2 text-xs font-semibold"
          style={{
            background: "color-mix(in srgb, var(--bt-primary) 14%, transparent)",
            color: "var(--bt-primary)",
          }}
        >
          Estimates
        </span>
        <Link
          href={`/leads/${leadId}?tab=proposals&compose=1`}
          className="rounded-md px-2.5 py-2 text-xs font-medium text-[var(--bt-muted)] hover:bg-[var(--bt-panel-bg-muted)] hover:text-[var(--bt-text)]"
        >
          Proposals
        </Link>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
        <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
          This lead
        </p>
        {estimates.length === 0 ? (
          <p className="px-1 text-xs text-[var(--bt-muted)]">No estimates yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {estimates.map((estimate) => (
              <li key={estimate.id}>
                <Link
                  href={`/leads/estimates/${estimate.id}`}
                  className="block rounded-md px-2 py-2 text-left hover:bg-[var(--bt-panel-bg-muted)]"
                  style={
                    estimate.active && activeKind === "estimate"
                      ? {
                          background: "color-mix(in srgb, var(--bt-primary) 12%, transparent)",
                          boxShadow: "inset 2px 0 0 var(--bt-primary)",
                        }
                      : undefined
                  }
                >
                  <span className="line-clamp-2 text-xs font-medium text-[var(--bt-text)]">{estimate.title}</span>
                  <span className="mt-0.5 block text-[10px] tabular-nums text-[var(--bt-muted)]">
                    {estimate.totalLabel} · {estimate.status}
                    {estimate.proposalId ? " · Proposal" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href={`/leads/${leadId}?tab=proposals&compose=1`}
        className="rounded-md border px-2.5 py-2 text-center text-[11px] font-semibold text-[var(--bt-primary)]"
        style={{ borderColor: "color-mix(in srgb, var(--bt-primary) 35%, var(--bt-border))" }}
      >
        + New from notes
      </Link>
    </aside>
  );
}
