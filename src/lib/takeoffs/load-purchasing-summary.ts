/**
 * Load job rows and build the purchasing rollup for UI + API.
 */

import { extendedCostCents } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import {
  buildJobPurchasingSummary,
  type JobPurchasingSummary,
  type PurchaseOrderSummaryInput,
  type TakeoffLineSummaryInput,
} from "@/lib/takeoffs/purchasing-summary";

export class JobNotFoundForPurchasingError extends Error {
  constructor(jobId: string) {
    super(`No job ${jobId} in this organization.`);
    this.name = "JobNotFoundForPurchasingError";
  }
}

export async function loadJobPurchasingSummary(
  organizationId: string,
  jobId: string,
): Promise<{ readonly job: { readonly id: string; readonly name: string }; readonly summary: JobPurchasingSummary }> {
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true, name: true },
  });
  if (!job) throw new JobNotFoundForPurchasingError(jobId);

  const [takeoffs, purchaseOrders] = await Promise.all([
    db.takeoff.findMany({
      where: { jobId: job.id, organizationId },
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
          include: {
            costCode: { select: { code: true, name: true } },
            purchasingIntent: { select: { status: true } },
          },
        },
      },
    }),
    db.purchaseOrder.findMany({
      where: { jobId: job.id, organizationId },
      include: { lineItems: { select: { costCodeId: true, quantityMilli: true, unitCostCents: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const takeoffLines: TakeoffLineSummaryInput[] = takeoffs.flatMap((takeoff) =>
    takeoff.lines.map((line) => ({
      id: line.id,
      takeoffId: takeoff.id,
      takeoffTitle: takeoff.title,
      title: line.title,
      costCodeId: line.costCodeId,
      costCodeLabel: `${line.costCode.code} — ${line.costCode.name}`,
      quantityMilli: line.quantityMilli,
      unit: line.unit,
      unitCostCents: line.unitCostCents,
      status: line.status,
      purchaseOrderId: line.purchaseOrderId,
      intentStatus: line.purchasingIntent?.status ?? null,
    })),
  );

  const poInputs: PurchaseOrderSummaryInput[] = purchaseOrders.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    title: po.title,
    vendorName: po.vendorName,
    status: po.status,
    workStatus: po.workStatus,
    sourceType: po.sourceType,
    sourceId: po.sourceId,
    totalCents: po.lineItems.reduce(
      (total, item) => total + extendedCostCents(item.quantityMilli, item.unitCostCents),
      0,
    ),
    lineCostCodeIds: po.lineItems.map((item) => item.costCodeId),
  }));

  return {
    job,
    summary: buildJobPurchasingSummary({ jobId: job.id, takeoffLines, purchaseOrders: poInputs }),
  };
}
