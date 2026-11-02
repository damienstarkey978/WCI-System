import { SetupNotice } from "@/app/admin/setup-notice";
import { estimateTotalCents } from "@/lib/budget/funnel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { LeadProposalsClient } from "./lead-proposals-client";
import type { LeadProposalRow } from "./proposals-grid";

export const dynamic = "force-dynamic";

/**
 * Cross-lead proposal list — Buildertrend's "Lead Proposals". Creating one
 * happens from the lead's own Proposals tab; this is the org-wide view with the
 * same Filter sidebar chrome as Lead Activities / Opportunities.
 */
export default async function LeadProposalsPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const proposals = await db.proposal.findMany({
    where: { organizationId: user.organizationId, leadId: { not: null } },
    orderBy: { createdAt: "desc" },
    include: { lead: { select: { id: true, name: true } }, options: { include: { estimate: { include: { lineItems: true } } } } },
  });

  const rows: LeadProposalRow[] = proposals.map((proposal) => {
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
  });

  return <LeadProposalsClient rows={rows} />;
}
