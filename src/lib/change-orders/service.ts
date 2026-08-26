/**
 * Change Orders — the other canonical explicit-conversion action alongside
 * "Send to Job Budget" (CLAUDE.md 2.3). Approving a change order is what moves its
 * cost and price deltas into the job's Budget; nothing about a change order
 * affects the budget until this runs.
 *
 * ITEMIZED change orders reuse rollUpEstimateLines() from the estimate module —
 * a ChangeOrderLineItem and an EstimateLineItem carry the same
 * (costCodeId, quantityMilli, unitCostCents, rateMode, rateBasisPoints) shape, and
 * "price each line individually, then sum" is exactly as true here as it is for
 * estimates (CLAUDE.md 5's principle applies identically to both).
 */

import { ChangeOrderMode, ChangeOrderStatus, CostType, FinancialSourceType, type RateMode } from "@/generated/prisma/enums";
import { rollUpEstimateLines, type CostCodeRollup } from "@/lib/budget/send-to-budget";
import { db } from "@/lib/db";
import { acceptsNewCommitments } from "@/lib/job-status";
import type { BasisPoints, Cents } from "@/lib/money";
import { emitEvent } from "@/lib/webhooks";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class JobNotOpenError extends Error {
  constructor(jobId: string, status: string) {
    super(`Job ${jobId} is ${status} and cannot take new change orders.`);
    this.name = "JobNotOpenError";
  }
}

export class ChangeOrderNotFoundError extends Error {
  constructor(changeOrderId: string) {
    super(`Change order ${changeOrderId} not found`);
    this.name = "ChangeOrderNotFoundError";
  }
}

export class ChangeOrderNotPendingError extends Error {
  constructor(changeOrderId: string, status: string) {
    super(`Change order ${changeOrderId} is ${status} and cannot be approved or declined.`);
    this.name = "ChangeOrderNotPendingError";
  }
}

export class IncompleteFlatChangeOrderError extends Error {
  constructor(changeOrderId: string) {
    super(`FLAT change order ${changeOrderId} is missing its cost code, cost, or client price.`);
    this.name = "IncompleteFlatChangeOrderError";
  }
}

export class EmptyChangeOrderError extends Error {
  constructor(changeOrderId: string) {
    super(`ITEMIZED change order ${changeOrderId} has no line items.`);
    this.name = "EmptyChangeOrderError";
  }
}

export interface CreateChangeOrderLineItemInput {
  readonly costCodeId: string;
  readonly costType?: CostType;
  readonly title: string;
  readonly quantityMilli: number;
  readonly unitCostCents: Cents;
  readonly rateMode: RateMode;
  readonly rateBasisPoints: BasisPoints;
}

export interface CreateChangeOrderInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly mode: ChangeOrderMode;
  readonly flatCostCodeId?: string;
  readonly flatCostCents?: Cents;
  readonly flatClientPriceCents?: Cents;
  readonly lineItems?: readonly CreateChangeOrderLineItemInput[];
}

export async function createChangeOrder(input: CreateChangeOrderInput) {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, status: true },
  });
  if (!job) throw new JobNotFoundError(input.jobId);
  if (!acceptsNewCommitments(job.status)) throw new JobNotOpenError(input.jobId, job.status);

  const isFlat = input.mode === ChangeOrderMode.FLAT;

  return db.changeOrder.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      mode: input.mode,
      ...(isFlat
        ? {
            flatCostCodeId: input.flatCostCodeId,
            flatCostCents: input.flatCostCents,
            flatClientPriceCents: input.flatClientPriceCents,
          }
        : {
            lineItems: {
              create: (input.lineItems ?? []).map((line, index) => ({
                costCodeId: line.costCodeId,
                costType: line.costType ?? "NONE",
                title: line.title,
                quantityMilli: line.quantityMilli,
                unitCostCents: line.unitCostCents,
                rateMode: line.rateMode,
                rateBasisPoints: line.rateBasisPoints,
                sortOrder: index,
              })),
            },
          }),
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}

function deltasFor(changeOrder: {
  id: string;
  mode: ChangeOrderMode;
  flatCostCodeId: string | null;
  flatCostCents: number | null;
  flatClientPriceCents: number | null;
  lineItems: readonly {
    costCodeId: string;
    quantityMilli: number;
    unitCostCents: number;
    rateMode: "MARKUP" | "MARGIN";
    rateBasisPoints: number;
  }[];
}): readonly CostCodeRollup[] {
  if (changeOrder.mode === ChangeOrderMode.FLAT) {
    if (!changeOrder.flatCostCodeId || changeOrder.flatCostCents === null || changeOrder.flatClientPriceCents === null) {
      throw new IncompleteFlatChangeOrderError(changeOrder.id);
    }
    return [
      {
        costCodeId: changeOrder.flatCostCodeId,
        costCents: changeOrder.flatCostCents,
        clientPriceCents: changeOrder.flatClientPriceCents,
        blendedMarkupBasisPoints: 0,
      },
    ];
  }

  if (changeOrder.lineItems.length === 0) {
    throw new EmptyChangeOrderError(changeOrder.id);
  }
  return rollUpEstimateLines(changeOrder.lineItems);
}

export interface ApproveChangeOrderInput {
  readonly organizationId: string;
  readonly changeOrderId: string;
  readonly clientSignatureName?: string;
  readonly clientSignatureIp?: string;
}

/**
 * Approve a change order: apply its cost/price deltas onto the job's BudgetLines
 * and mark it APPROVED. A cost code with no prior budget line gets one created
 * with originalBudgetCost/originalClientPrice at zero — the change order
 * introduces scope that was never in the original budget, so original and
 * revised should diverge by exactly this amount, not silently backfill an
 * original figure that never existed.
 */
export async function approveChangeOrder(input: ApproveChangeOrderInput) {
  const result = await db.$transaction(async (tx) => {
    const changeOrder = await tx.changeOrder.findFirst({
      where: { id: input.changeOrderId, organizationId: input.organizationId },
      include: { lineItems: true },
    });
    if (!changeOrder) throw new ChangeOrderNotFoundError(input.changeOrderId);
    if (changeOrder.status !== ChangeOrderStatus.DRAFT && changeOrder.status !== ChangeOrderStatus.PENDING_APPROVAL) {
      throw new ChangeOrderNotPendingError(input.changeOrderId, changeOrder.status);
    }

    const deltas = deltasFor(changeOrder);

    for (const delta of deltas) {
      const existing = await tx.budgetLine.findUnique({
        where: { jobId_costCodeId: { jobId: changeOrder.jobId, costCodeId: delta.costCodeId } },
      });

      if (existing) {
        await tx.budgetLine.update({
          where: { id: existing.id },
          data: {
            revisedBudgetCostCents: existing.revisedBudgetCostCents + delta.costCents,
            revisedClientPriceCents: existing.revisedClientPriceCents + delta.clientPriceCents,
          },
        });
      } else {
        await tx.budgetLine.create({
          data: {
            jobId: changeOrder.jobId,
            costCodeId: delta.costCodeId,
            originalBudgetCostCents: 0,
            revisedBudgetCostCents: delta.costCents,
            originalClientPriceCents: 0,
            revisedClientPriceCents: delta.clientPriceCents,
          },
        });
      }
    }

    const updated = await tx.changeOrder.update({
      where: { id: changeOrder.id },
      data: {
        status: ChangeOrderStatus.APPROVED,
        approvedAt: new Date(),
        clientSignatureName: input.clientSignatureName ?? changeOrder.clientSignatureName,
        clientSignedAt: input.clientSignatureName ? new Date() : changeOrder.clientSignedAt,
        clientSignatureIp: input.clientSignatureIp ?? changeOrder.clientSignatureIp,
      },
    });

    return { changeOrder: updated, deltas };
  });

  await emitEvent(input.organizationId, "change_order.approved", {
    changeOrderId: result.changeOrder.id,
    jobId: result.changeOrder.jobId,
    deltas: result.deltas.map((d) => ({ costCodeId: d.costCodeId, costCents: d.costCents, clientPriceCents: d.clientPriceCents })),
  });

  return result;
}

export async function declineChangeOrder(organizationId: string, changeOrderId: string) {
  const changeOrder = await db.changeOrder.findFirst({ where: { id: changeOrderId, organizationId } });
  if (!changeOrder) throw new ChangeOrderNotFoundError(changeOrderId);
  if (changeOrder.status !== ChangeOrderStatus.DRAFT && changeOrder.status !== ChangeOrderStatus.PENDING_APPROVAL) {
    throw new ChangeOrderNotPendingError(changeOrderId, changeOrder.status);
  }

  return db.changeOrder.update({ where: { id: changeOrder.id }, data: { status: ChangeOrderStatus.DECLINED } });
}

export class ChangeOrderNotApprovedError extends Error {
  constructor(changeOrderId: string) {
    super(`Change order ${changeOrderId} must be APPROVED before it can be pushed to a purchase order.`);
    this.name = "ChangeOrderNotApprovedError";
  }
}

/**
 * "Push to PO" follow-up conversion (CLAUDE.md 3: an approved CO "can spawn
 * PO/Bid/Invoice/Schedule updates via the same explicit conversion action
 * pattern"). Creates one PO line per change-order line (or one line for a FLAT
 * CO), tagged with sourceType CHANGE_ORDER and sourceId back to the CO.
 */
export async function pushChangeOrderToPurchaseOrder(
  organizationId: string,
  changeOrderId: string,
  poNumber: string,
  vendorName: string,
) {
  const changeOrder = await db.changeOrder.findFirst({
    where: { id: changeOrderId, organizationId },
    include: { lineItems: true },
  });
  if (!changeOrder) throw new ChangeOrderNotFoundError(changeOrderId);
  if (changeOrder.status !== ChangeOrderStatus.APPROVED) throw new ChangeOrderNotApprovedError(changeOrderId);

  const lineItems =
    changeOrder.mode === ChangeOrderMode.FLAT
      ? [
          {
            costCodeId: changeOrder.flatCostCodeId!,
            costType: CostType.NONE,
            title: changeOrder.title,
            quantityMilli: 1000,
            unitCostCents: changeOrder.flatCostCents!,
          },
        ]
      : changeOrder.lineItems.map((line) => ({
          costCodeId: line.costCodeId,
          costType: line.costType,
          title: line.title,
          quantityMilli: line.quantityMilli,
          unitCostCents: line.unitCostCents,
        }));

  return db.purchaseOrder.create({
    data: {
      organizationId,
      jobId: changeOrder.jobId,
      poNumber,
      vendorName,
      sourceType: FinancialSourceType.CHANGE_ORDER,
      sourceId: changeOrder.id,
      lineItems: { create: lineItems.map((line, index) => ({ ...line, sortOrder: index })) },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}
