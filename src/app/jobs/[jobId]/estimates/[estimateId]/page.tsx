import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

import { AddLineItemForm } from "./add-line-item-form";
import { LineItemsGrid } from "./line-items-grid";
import { SendToBudgetButton } from "./send-to-budget-button";

export const dynamic = "force-dynamic";

export default async function EstimateWorksheetPage({ params }: PageProps<"/jobs/[jobId]/estimates/[estimateId]">) {
  const { jobId, estimateId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) notFound();

  const [estimate, costCodes] = await Promise.all([
    db.estimate.findFirst({
      where: { id: estimateId, jobId: job.id, organizationId: user.organizationId },
      include: { lineItems: { orderBy: { sortOrder: "asc" }, include: { costCode: { select: { code: true, name: true } } } } },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);
  if (!estimate) notFound();

  const rows = estimate.lineItems.map((item) => {
    const costCents = extendedCostCents(item.quantityMilli, item.unitCostCents);
    return {
      id: item.id,
      costCode: `${item.costCode.code} ${item.costCode.name}`,
      title: item.title,
      groupLabel: item.groupLabel,
      quantityMilli: item.quantityMilli,
      unitCostCents: item.unitCostCents,
      rateMode: item.rateMode,
      rateBasisPoints: item.rateBasisPoints,
      costCents,
      clientPriceCents: priceWithRate(costCents, item.rateMode, item.rateBasisPoints),
    };
  });

  const totalCost = rows.reduce((sum, row) => sum + row.costCents, 0);
  const totalPrice = rows.reduce((sum, row) => sum + row.clientPriceCents, 0);
  const profit = totalPrice - totalCost;
  // Margin is profit over price; shown to one decimal via the shared basis-point formatter.
  const marginBasisPoints = totalPrice > 0 ? Math.round((profit / totalPrice) * 10_000) : 0;

  const locked = estimate.lockedAt !== null;
  const canSend = (user.role === UserRole.ADMIN || user.role === UserRole.PM) && !locked && rows.length > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title={estimate.title}
        action={
          <div className="flex items-center gap-2">
            {canSend ? <SendToBudgetButton jobId={job.id} estimateId={estimate.id} /> : null}
            {locked ? null : (
              <CreateModal triggerLabel="+ Line item" title="New line item">
                <AddLineItemForm jobId={job.id} estimateId={estimate.id} costCodes={costCodes} />
              </CreateModal>
            )}
          </div>
        }
      />

      <div className="flex items-center justify-between">
        <Link href={`/jobs/${job.id}/estimates`} className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
          ← All estimates
        </Link>
        <span className="text-xs text-[var(--bt-muted)]">
          {estimate.status}
          {locked && estimate.lockedAt ? `, locked ${formatDate(estimate.lockedAt)}` : ""}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Builder cost", value: formatMoney(totalCost) },
          { label: "Client price", value: formatMoney(totalPrice) },
          { label: "Profit", value: formatMoney(profit) },
          { label: "Margin", value: formatPercent(marginBasisPoints) },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{card.label}</div>
            <div className="mt-1 text-lg font-semibold text-[var(--bt-text)]">{card.value}</div>
          </div>
        ))}
      </div>

      <LineItemsGrid jobId={job.id} estimateId={estimate.id} rows={rows} editable={!locked} />
    </div>
  );
}
