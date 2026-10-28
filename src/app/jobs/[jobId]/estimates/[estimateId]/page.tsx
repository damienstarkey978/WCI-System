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
import { UnlockButton } from "./unlock-button";

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

  // Editable only while DRAFT (src/lib/estimates/service.ts); anything else is locked or already with a client.
  const locked = estimate.status !== "DRAFT";
  const canManage = user.role === UserRole.ADMIN || user.role === UserRole.PM;
  const canSend = canManage && !locked && rows.length > 0;
  const canUnlock = canManage && estimate.status === "LOCKED";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        jobName={job.name}
        title={estimate.title}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canUnlock ? <UnlockButton jobId={job.id} estimateId={estimate.id} /> : null}
            {canSend ? <SendToBudgetButton jobId={job.id} estimateId={estimate.id} resend={estimate.sentToBudgetAt !== null} /> : null}
            {locked ? null : (
              <CreateModal triggerLabel="+ Line item" title="New line item">
                <AddLineItemForm jobId={job.id} estimateId={estimate.id} costCodes={costCodes} />
              </CreateModal>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
          <Link href={`/jobs/${job.id}/estimates`} className="text-[var(--bt-primary)] hover:underline">
            ← Worksheets
          </Link>
          <Link href={`/jobs/${job.id}/budget`} className="text-[var(--bt-primary)] hover:underline">
            Job Budget
          </Link>
        </div>
        <span className="text-xs text-[var(--bt-muted)]">
          {estimate.status}, revision {estimate.version}
          {estimate.lockedAt ? `, locked ${formatDate(estimate.lockedAt)}` : ""}
        </span>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-3 text-sm"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--bt-muted)]">
          <span>
            Original <strong className="text-[var(--bt-text)]">{formatMoney(totalPrice)}</strong>
          </span>
          <span>+</span>
          <span>
            Approved COs <strong className="text-[var(--bt-text)]">{formatMoney(0)}</strong>
          </span>
          <span>+</span>
          <span>
            New <strong className="text-[var(--bt-text)]">{formatMoney(0)}</strong>
          </span>
          <span>=</span>
          <span>
            Total <strong className="text-[var(--bt-text)]">{formatMoney(totalPrice)}</strong>
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-[var(--bt-muted)]">
          <span>Builder cost {formatMoney(totalCost)}</span>
          <span>Profit {formatMoney(profit)}</span>
          <span>Margin {formatPercent(marginBasisPoints)}</span>
        </div>
      </div>

      <LineItemsGrid jobId={job.id} estimateId={estimate.id} rows={rows} editable={!locked} />
    </div>
  );
}
