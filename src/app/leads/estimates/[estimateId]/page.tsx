import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EstimateProposalToggle } from "@/components/estimates/EstimateProposalToggle";
import { EstimateSpreadsheet, type SpreadsheetGroup } from "@/components/estimates/EstimateSpreadsheet";
import { estimateTotalCents, extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { parsePendingProposalDraft } from "@/lib/crm/pending-proposal-draft";

import { CreateProposalFromEstimateButton } from "./create-proposal-button";

export const dynamic = "force-dynamic";

/**
 * Handoff-style estimate-first review: spreadsheet columns and totals before any
 * client-facing proposal. Convert to Proposal is the explicit conversion.
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

  const estimate = await db.estimate.findFirst({
    where: { id: estimateId, organizationId: user.organizationId },
    include: {
      lead: { select: { id: true, name: true, title: true } },
      job: { select: { id: true, name: true } },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { costCode: { select: { code: true, name: true } } },
      },
      proposalOptions: { select: { proposalId: true }, take: 1 },
    },
  });
  if (!estimate) notFound();

  const lead =
    estimate.lead ??
    (estimate.jobId
      ? await db.lead.findFirst({
          where: { organizationId: user.organizationId, convertedJobId: estimate.jobId },
          select: { id: true, name: true, title: true },
        })
      : null);

  const linkedProposalId = estimate.proposalOptions[0]?.proposalId ?? null;
  const pending = parsePendingProposalDraft(estimate.pendingProposalDraft);
  const canConvert = !linkedProposalId && (pending !== null || estimate.lineItems.length > 0);

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

  const backHref = lead
    ? `/leads/${lead.id}?tab=proposals`
    : estimate.job
      ? `/jobs/${estimate.job.id}/estimates/${estimate.id}`
      : "/leads";
  const backLabel = lead
    ? `← ${lead.title ?? lead.name}`
    : estimate.job
      ? "← Job estimate worksheet"
      : "← Leads";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 pb-8 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={backHref} className="text-xs text-[var(--bt-muted)] hover:underline">
          {backLabel}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium text-[var(--bt-muted)]">
          <span className="rounded px-2 py-1" style={{ background: "var(--bt-panel-bg-muted)" }}>
            1. Notes
          </span>
          <span aria-hidden>→</span>
          <span className="rounded px-2 py-1 font-semibold text-[var(--bt-on-primary)]" style={{ background: "var(--bt-primary)" }}>
            2. Estimate
          </span>
          <span aria-hidden>→</span>
          <span className="rounded px-2 py-1" style={{ background: "var(--bt-panel-bg-muted)" }}>
            3. Proposal
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-[var(--bt-text)] sm:text-2xl">{estimate.title}</h1>
            {estimate.aiGenerated ? (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ background: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", color: "var(--bt-primary)" }}
              >
                Drafted by Jarvis
              </span>
            ) : null}
            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">{estimate.status}</span>
          </div>
          <p className="mt-1 text-sm text-[var(--bt-muted)]">
            Review quantities, unit costs, and markup. Convert to a Proposal when the numbers look right.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <EstimateProposalToggle
            active="estimate"
            estimateHref={`/leads/estimates/${estimate.id}`}
            proposalHref={linkedProposalId ? `/leads/proposals/${linkedProposalId}?view=proposal` : null}
            proposalDisabledReason="Convert this estimate to unlock the Proposal view"
          />
          <div className="flex flex-wrap items-center gap-2">
            {linkedProposalId ? (
              <Link
                href={`/leads/proposals/${linkedProposalId}?view=proposal`}
                className="min-h-11 touch-manipulation rounded px-4 py-2.5 text-center text-sm font-semibold text-[var(--bt-on-primary)] sm:min-h-0 sm:py-2 sm:text-xs"
                style={{ background: "var(--bt-primary)" }}
              >
                Open Proposal
              </Link>
            ) : canConvert ? (
              <CreateProposalFromEstimateButton estimateId={estimate.id} />
            ) : null}
          </div>
        </div>
      </div>

      {pending && !linkedProposalId ? (
        <div
          className="rounded-lg border px-3 py-2.5 text-xs sm:text-sm"
          style={{
            borderColor: "color-mix(in srgb, var(--bt-primary) 35%, var(--bt-border))",
            background: "color-mix(in srgb, var(--bt-primary) 8%, transparent)",
            color: "var(--bt-text)",
          }}
        >
          Client narrative is ready ({pending.sections.length} section{pending.sections.length === 1 ? "" : "s"}
          {pending.coverMessage ? ", cover message" : ""}). Convert to Proposal to attach it to a DRAFT proposal
          linked to this estimate.
        </div>
      ) : null}

      <EstimateSpreadsheet
        groups={groups}
        totalBuilderCostCents={totalBuilderCostCents}
        totalClientCents={totalClientCents}
      />

      <p className="text-center text-xs text-[var(--bt-muted)] sm:text-left">
        Estimate total {formatMoney(totalClientCents)} · {estimate.lineItems.length} line
        {estimate.lineItems.length === 1 ? "" : "s"}
        {lead ? ` · Lead ${lead.name}` : ""}
      </p>
    </div>
  );
}
