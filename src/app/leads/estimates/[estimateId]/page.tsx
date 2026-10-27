import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { estimateTotalCents, extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { parsePendingProposalDraft } from "@/lib/crm/pending-proposal-draft";

import { CreateProposalFromEstimateButton } from "./create-proposal-button";

export const dynamic = "force-dynamic";

/**
 * Handoff-style estimate-first review: line items and cost codes before any
 * client-facing proposal. Create Proposal is the explicit conversion.
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

  const groups = new Map<string, typeof estimate.lineItems>();
  for (const item of estimate.lineItems) {
    const key = item.groupLabel ?? "Ungrouped";
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }

  const totalCents = estimateTotalCents(estimate.lineItems);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <div>
        {lead ? (
          <Link href={`/leads/${lead.id}?tab=proposals`} className="text-xs text-[var(--bt-muted)] hover:underline">
            ← Back to {lead.title ?? lead.name} Proposals
          </Link>
        ) : estimate.job ? (
          <Link href={`/jobs/${estimate.job.id}/estimates/${estimate.id}`} className="text-xs text-[var(--bt-muted)] hover:underline">
            ← Open job estimate worksheet
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--bt-muted)]">
        <span className="rounded px-2 py-1 text-[var(--bt-primary)]" style={{ background: "color-mix(in srgb, var(--bt-primary) 14%, transparent)" }}>
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

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-[var(--bt-text)]">{estimate.title}</h1>
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
              Review cost-coded line items first. Create a Proposal only when the numbers look right.
            </p>
            <p className="mt-2 text-lg font-semibold text-[var(--bt-text)]">{formatMoney(totalCents)}</p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {linkedProposalId ? (
              <Link
                href={`/leads/proposals/${linkedProposalId}`}
                className="min-h-11 touch-manipulation rounded px-4 py-2.5 text-center text-sm font-semibold text-[var(--bt-on-primary)] sm:min-h-0 sm:py-1.5 sm:text-xs"
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

      <div className="flex flex-col gap-3">
        {[...groups.entries()].map(([groupLabel, items]) => (
          <div key={groupLabel} className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              {groupLabel}
            </div>
            <ul className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {items.map((item) => {
                const costCents = extendedCostCents(item.quantityMilli, item.unitCostCents);
                const priceCents = priceWithRate(costCents, item.rateMode, item.rateBasisPoints);
                return (
                  <li key={item.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--bt-text)]">{item.title}</div>
                      <div className="text-xs text-[var(--bt-muted)]">
                        {item.costCode.code} · {item.costCode.name}
                      </div>
                      {item.description ? <p className="mt-1 text-xs text-[var(--bt-muted)]">{item.description}</p> : null}
                    </div>
                    <div className="shrink-0 text-sm font-medium text-[var(--bt-text)] sm:text-right">{formatMoney(priceCents)}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {estimate.lineItems.length === 0 ? (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
            No line items on this estimate yet.
          </p>
        ) : null}
      </div>

      {pending ? (
        <p className="text-xs text-[var(--bt-muted)]">
          Client narrative is ready ({pending.sections.length} section{pending.sections.length === 1 ? "" : "s"}). Create Proposal to attach it to a DRAFT
          proposal linked to this estimate.
        </p>
      ) : null}
    </div>
  );
}
