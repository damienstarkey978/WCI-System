import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";

import { estimateTotalCents } from "@/lib/budget/funnel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { LeadProposalsGrid } from "./proposals-grid";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "SENT", label: "Sent" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "DECLINED", label: "Declined" },
] as const;

/**
 * Cross-lead proposal list — Buildertrend's "Lead Proposals". Creating one
 * happens from the lead's own Proposals tab (src/app/leads/[leadId]/page.tsx),
 * since a proposal always needs a specific lead's contact info; this is the
 * org-wide view across all of them, mirroring the Lead Activities feed.
 */
export default async function LeadProposalsPage({ searchParams }: PageProps<"/leads/proposals">) {
  const { status: statusParam } = await searchParams;
  const status = TABS.some((t) => t.key === statusParam) ? (statusParam as (typeof TABS)[number]["key"]) : "all";
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const allProposals = await db.proposal.findMany({
    where: { organizationId: user.organizationId, leadId: { not: null } },
    orderBy: { createdAt: "desc" },
    include: { lead: { select: { id: true, name: true } }, options: { include: { estimate: { include: { lineItems: true } } } } },
  });

  const proposals = status === "all" ? allProposals : allProposals.filter((proposal) => proposal.status === status);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead proposals</h1>

      <nav className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/leads/proposals${t.key === "all" ? "" : `?status=${t.key}`}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{ borderColor: t.key === status ? "var(--bt-primary)" : "transparent", color: t.key === status ? "var(--bt-primary)" : "var(--bt-muted)" }}
          >
            {t.label} ({t.key === "all" ? allProposals.length : allProposals.filter((p) => p.status === t.key).length})
          </Link>
        ))}
      </nav>

      {allProposals.length === 0 ? (
        <EmptyState title="No proposals yet" description="Proposals created from a lead will appear here." />
      ) : (
        <LeadProposalsGrid
          rows={proposals.map((proposal) => {
            const optionTotals = proposal.options.map((option) => estimateTotalCents(option.estimate.lineItems));
            const selected = proposal.selectedOptionId ? proposal.options.find((o) => o.id === proposal.selectedOptionId) : undefined;
            const single = optionTotals.length <= 1 || selected;
            return {
              id: proposal.id,
              leadId: proposal.lead?.id ?? null,
              leadName: proposal.lead?.name ?? null,
              title: proposal.title,
              status: proposal.status,
              createdAt: proposal.createdAt.toISOString(),
              totalCents: single ? (selected ? estimateTotalCents(selected.estimate.lineItems) : (optionTotals[0] ?? 0)) : Math.min(...optionTotals),
              totalMaxCents: single ? null : Math.max(...optionTotals),
            };
          })}
        />
      )}
    </div>
  );
}
