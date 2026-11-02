import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { salesRepLeadWhere } from "@/lib/staff/sales-rep-scope";

import { LeadOpportunitiesClient } from "./lead-opportunities-client";
import type { LeadRow } from "./leads-grid";

export const dynamic = "force-dynamic";

function ageDays(createdAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Buildertrend-match "Lead Opportunities" list — flat sortable table with the
 * same Filter sidebar chrome as Lead Activities (keyword / status / assignee /
 * source / created date). Stage remains editable inline via StageSelect.
 */
export default async function LeadsPage() {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const [leads, clients] = await Promise.all([
    db.lead.findMany({
      where: { organizationId: user.organizationId, ...salesRepLeadWhere(user) },
      orderBy: { createdAt: "desc" },
      include: { assignedUser: { select: { name: true, email: true } } },
    }),
    db.client.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const assigneeSet = new Set<string>();
  const sourceSet = new Set<string>();

  const rows: LeadRow[] = leads.map((lead) => {
    const assignedUser = lead.assignedUser?.name || lead.assignedUser?.email || null;
    if (assignedUser) assigneeSet.add(assignedUser);
    if (lead.source) sourceSet.add(lead.source);
    return {
      id: lead.id,
      title: lead.title ?? lead.name,
      converted: lead.convertedJobId !== null,
      contactName: lead.name,
      contactPhone: lead.phone,
      contactEmail: lead.email,
      city: lead.city,
      source: lead.source,
      createdAt: lead.createdAt.toISOString(),
      stage: lead.stage,
      assignedUser,
      ageDays: ageDays(lead.createdAt),
      confidencePercent: lead.confidencePercent,
      revenueMinCents: lead.estimatedRevenueMinCents,
      revenueMaxCents: lead.estimatedRevenueMaxCents,
    };
  });

  return (
    <LeadOpportunitiesClient
      rows={rows}
      assignedUserOptions={[...assigneeSet].sort((a, b) => a.localeCompare(b))}
      sourceOptions={[...sourceSet].sort((a, b) => a.localeCompare(b))}
      clients={clients.map((c) => ({ id: c.id, name: c.name, email: c.email ?? "" }))}
    />
  );
}
