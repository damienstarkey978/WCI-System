import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { ConvertToMenu } from "@/components/estimates/ConvertToMenu";
import { EstimateHandyDock } from "@/components/estimates/EstimateHandyDock";
import { EstimateProposalToggle } from "@/components/estimates/EstimateProposalToggle";
import { EstimateSaveButton } from "@/components/estimates/EstimateSaveButton";
import { EstimateSpreadsheet, type SpreadsheetGroup } from "@/components/estimates/EstimateSpreadsheet";
import { LeadEstimateWorkspaceNav } from "@/components/estimates/LeadEstimateWorkspaceNav";
import { estimateTotalCents, extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { currentAppUser } from "@/lib/auth";
import { parsePendingProposalDraft } from "@/lib/crm/pending-proposal-draft";
import { db } from "@/lib/db";
import { isAnthropicConfigured } from "@/lib/env";
import { buildHandyPricingTerms, buildHandyScopeGroups } from "@/lib/estimates/handy-scope";
import { isJarvisUiEnabled } from "@/lib/feature-flags";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Handoff-like three-panel estimate workspace:
 * left lead nav · center spreadsheet · right docked Jarvis.
 * This is the primary staff experience after notes→draft — not the Proposals launcher.
 */
export default async function LeadEstimatePage({ params }: PageProps<"/leads/estimates/[estimateId]">) {
  const { estimateId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const [estimate, instructionCount] = await Promise.all([
    db.estimate.findFirst({
      where: { id: estimateId, organizationId: user.organizationId },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            title: true,
            notes: true,
            convertedJobId: true,
          },
        },
        job: { select: { id: true, name: true } },
        lineItems: {
          orderBy: { sortOrder: "asc" },
          include: { costCode: { select: { code: true, name: true } } },
        },
        proposalOptions: { select: { proposalId: true }, take: 1 },
      },
    }),
    db.aiPreferenceInstruction.count({
      where: { organizationId: user.organizationId, enabled: true, forType: "ESTIMATE" },
    }),
  ]);
  if (!estimate) notFound();

  const lead =
    estimate.lead ??
    (estimate.jobId
      ? await db.lead.findFirst({
          where: { organizationId: user.organizationId, convertedJobId: estimate.jobId },
          select: { id: true, name: true, title: true, notes: true, convertedJobId: true },
        })
      : null);

  const siblingEstimates = lead
    ? await db.estimate.findMany({
        where: {
          organizationId: user.organizationId,
          OR: [
            { leadId: lead.id },
            ...(lead.convertedJobId ? [{ jobId: lead.convertedJobId }] : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        include: {
          lineItems: {
            select: { quantityMilli: true, unitCostCents: true, rateMode: true, rateBasisPoints: true },
          },
          proposalOptions: { select: { proposalId: true }, take: 1 },
        },
      })
    : [];

  const linkedProposalId = estimate.proposalOptions[0]?.proposalId ?? null;
  const pending = parsePendingProposalDraft(estimate.pendingProposalDraft);
  const canConvert = !linkedProposalId && (pending !== null || estimate.lineItems.length > 0);
  const editable = estimate.status === "DRAFT";

  const groupMap = new Map<string, typeof estimate.lineItems>();
  for (const item of estimate.lineItems) {
    const key = item.groupLabel ?? "Ungrouped";
    const existing = groupMap.get(key);
    if (existing) existing.push(item);
    else groupMap.set(key, [item]);
  }

  const groups: SpreadsheetGroup[] = [...groupMap.entries()].map(([label, items]) => {
    const mapped = items.map((item) => {
      const builderCostCents = extendedCostCents(item.quantityMilli, item.unitCostCents);
      const clientTotalCents = priceWithRate(builderCostCents, item.rateMode, item.rateBasisPoints);
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        costCodeLabel: `${item.costCode.code} · ${item.costCode.name}`,
        costType: item.costType,
        quantityMilli: item.quantityMilli,
        unit: item.unit,
        unitCostCents: item.unitCostCents,
        rateMode: item.rateMode,
        rateBasisPoints: item.rateBasisPoints,
        builderCostCents,
        clientTotalCents,
      };
    });
    return {
      label,
      items: mapped,
      groupClientTotalCents: mapped.reduce((sum, row) => sum + row.clientTotalCents, 0),
    };
  });

  const totalClientCents = estimateTotalCents(estimate.lineItems);
  const totalBuilderCostCents = groups.reduce(
    (sum, group) => sum + group.items.reduce((s, row) => s + row.builderCostCents, 0),
    0,
  );
  const totalMarkupCents = totalClientCents - totalBuilderCostCents;
  const marginLabel =
    totalClientCents > 0
      ? `${((totalMarkupCents / totalClientCents) * 100).toFixed(1)}%`
      : null;

  const pdfHref = linkedProposalId ? `/proposals/${linkedProposalId}/pdf` : null;
  const navEstimates = siblingEstimates.map((row) => ({
    id: row.id,
    title: row.title,
    totalLabel: formatMoney(estimateTotalCents(row.lineItems)),
    status: row.status,
    proposalId: row.proposalOptions[0]?.proposalId ?? null,
    active: row.id === estimate.id,
  }));

  const scopeGroups = buildHandyScopeGroups(groups);
  const pricingTerms = buildHandyPricingTerms({
    groups,
    totalClientCents,
    totalBuilderCostCents,
    lineItemCount: estimate.lineItems.length,
  });

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col gap-2 p-1.5 pb-16 sm:gap-2.5 sm:p-2 sm:pb-5 lg:p-3">
      <div className="flex flex-wrap items-center gap-2 px-1 lg:hidden">
        <Link
          href={
            lead
              ? `/leads/${lead.id}?tab=proposals&compose=1`
              : estimate.job
                ? `/jobs/${estimate.job.id}/estimates/${estimate.id}`
                : "/leads"
          }
          className="text-xs text-[var(--bt-muted)] hover:underline"
        >
          {lead ? `← ${lead.title ?? lead.name}` : estimate.job ? "← Job estimate" : "← Leads"}
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:items-start lg:gap-2.5">
        {lead ? (
          <LeadEstimateWorkspaceNav
            leadId={lead.id}
            leadName={lead.name}
            leadTitle={lead.title}
            estimates={navEstimates}
            activeKind="estimate"
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div
            className="sticky top-0 z-20 space-y-1.5 border-b px-2.5 py-2 backdrop-blur-md sm:rounded-md sm:border sm:px-3"
            style={{
              borderColor: "var(--bt-border)",
              background: "color-mix(in srgb, var(--bt-panel-bg) 94%, transparent)",
            }}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="truncate text-base font-semibold text-[var(--bt-text)] sm:text-lg">
                    {estimate.title}
                  </h1>
                  {estimate.aiGenerated ? (
                    <span
                      className="rounded px-1.5 py-px text-[9px] font-semibold"
                      style={{
                        background: "color-mix(in srgb, var(--bt-primary) 14%, transparent)",
                        color: "var(--bt-primary)",
                      }}
                    >
                      Jarvis
                    </span>
                  ) : null}
                  <span className="rounded bg-gray-200 px-1.5 py-px text-[9px] font-semibold text-gray-700">
                    {estimate.status}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <EstimateSaveButton editable={editable} />
                <ConvertToMenu
                  estimateId={estimate.id}
                  linkedProposalId={linkedProposalId}
                  canConvertToProposal={canConvert}
                  pdfHref={pdfHref}
                  csvHref={`/leads/estimates/${estimate.id}/csv`}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="rounded border px-2 py-0.5 text-[10px] font-semibold text-[var(--bt-muted)]"
                  style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
                >
                  No catalogs applied
                </span>
                {instructionCount > 0 ? (
                  <span
                    className="rounded border px-2 py-0.5 text-[10px] font-semibold"
                    style={{ borderColor: "var(--bt-border)", color: "var(--bt-muted)" }}
                    title="Enabled estimate AI preference instructions from Handoff Presets"
                  >
                    {instructionCount} instruction{instructionCount === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span
                    className="rounded border px-2 py-0.5 text-[10px] font-semibold text-[var(--bt-muted)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    0 instructions
                  </span>
                )}
                <span className="text-[11px] tabular-nums text-[var(--bt-muted)]">
                  {formatMoney(totalClientCents)} · {estimate.lineItems.length} lines
                  {marginLabel ? ` · ${marginLabel} margin` : ""}
                </span>
              </div>
              <EstimateProposalToggle
                active="estimate"
                estimateHref={`/leads/estimates/${estimate.id}`}
                proposalHref={linkedProposalId ? `/leads/proposals/${linkedProposalId}?view=proposal` : null}
                proposalDisabledReason="Convert this estimate to unlock the Proposal view"
              />
            </div>
          </div>

          {pending && !linkedProposalId ? (
            <div
              className="rounded-md border px-2.5 py-1.5 text-[11px] sm:text-xs"
              style={{
                borderColor: "color-mix(in srgb, var(--bt-primary) 35%, var(--bt-border))",
                background: "color-mix(in srgb, var(--bt-primary) 8%, transparent)",
                color: "var(--bt-text)",
              }}
            >
              Client narrative ready ({pending.sections.length} section
              {pending.sections.length === 1 ? "" : "s"}
              {pending.coverMessage ? ", cover" : ""}). Convert to Proposal to attach it.
            </div>
          ) : null}

          <EstimateSpreadsheet
            groups={groups}
            totalBuilderCostCents={totalBuilderCostCents}
            totalClientCents={totalClientCents}
            estimateId={estimate.id}
            proposalId={linkedProposalId}
            reorderable={editable}
          />
        </div>

        {lead ? (
          <EstimateHandyDock
            leadId={lead.id}
            leadName={lead.name}
            estimateId={estimate.id}
            proposalId={linkedProposalId}
            estimateTitle={estimate.title}
            jarvisUiEnabled={isJarvisUiEnabled()}
            anthropicConfigured={isAnthropicConfigured()}
            scopeNotes={lead.notes}
            scopeGroups={scopeGroups}
            pricingTerms={pricingTerms}
          />
        ) : null}
      </div>
    </div>
  );
}
