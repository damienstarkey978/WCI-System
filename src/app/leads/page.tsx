import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";

import { AddLeadOpportunityModal } from "./add-lead-opportunity-modal";
import { LeadsGrid } from "./leads-grid";

export const dynamic = "force-dynamic";

function ageDays(createdAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Buildertrend-match "Lead Opportunities" list — a flat sortable-by-column table
 * (Title / Client Contact / Created Date / Lead Status / Age / Confidence / Est.
 * Revenue Min / Max), replacing the earlier ad-hoc Kanban-by-stage board. Stage is
 * still changeable inline (StageSelect) — Buildertrend's own list doesn't show a
 * separate pipeline column, but dropping the ability to change it would be a real
 * regression, not just a cosmetic one.
 */
export default async function LeadsPage() {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const [leads, clients] = await Promise.all([
    db.lead.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" } }),
    db.client.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead opportunities</h1>
      </div>

      <AddLeadOpportunityModal clients={clients} />

      <LeadsGrid
        rows={leads.map((lead) => ({
          id: lead.id,
          title: lead.title ?? lead.name,
          converted: lead.convertedJobId !== null,
          contactName: lead.name,
          contactEmail: lead.email,
          createdAt: lead.createdAt.toISOString(),
          stage: lead.stage,
          ageDays: ageDays(lead.createdAt),
          confidencePercent: lead.confidencePercent,
          revenueMinCents: lead.estimatedRevenueMinCents,
          revenueMaxCents: lead.estimatedRevenueMaxCents,
        }))}
      />
    </div>
  );
}
