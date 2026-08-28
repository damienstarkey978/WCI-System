/**
 * Purchase order creation — extracted from src/app/api/v1/purchase-orders/route.ts
 * (mirroring src/lib/bills/service.ts) so a second caller (the staff Purchase
 * Orders page) can create a real PurchaseOrder through the exact same validation
 * path instead of a parallel copy of it. Behavior is unchanged from the original
 * route: the same checks, in the same order, with the same error meanings.
 */

import { Prisma } from "@/generated/prisma/client";
import type { CostType, FinancialSourceType } from "@/generated/prisma/enums";
import { extendedCostCents } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import { acceptsNewCommitments } from "@/lib/job-status";
import { emitEvent } from "@/lib/webhooks";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`No job ${jobId} in this organization.`);
    this.name = "JobNotFoundError";
  }
}

export class JobNotOpenError extends Error {
  constructor(jobId: string, status: string) {
    super(`Job ${jobId} is ${status} and cannot take new purchase orders.`);
    this.name = "JobNotOpenError";
  }
}

export class UnknownCostCodeError extends Error {
  constructor(public readonly unknownIds: readonly string[]) {
    super("One or more cost codes are not in this organization.");
    this.name = "UnknownCostCodeError";
  }
}

export class UnknownVendorError extends Error {
  constructor(vendorId: string) {
    super(`No vendor ${vendorId} in this organization.`);
    this.name = "UnknownVendorError";
  }
}

export class DuplicatePoNumberError extends Error {
  constructor(poNumber: string) {
    super(`Purchase order "${poNumber}" already exists.`);
    this.name = "DuplicatePoNumberError";
  }
}

export interface CreatePurchaseOrderLineItemInput {
  readonly costCodeId: string;
  readonly costType?: CostType;
  readonly title: string;
  readonly quantityMilli?: number;
  readonly unitCostCents: number;
}

export interface CreatePurchaseOrderInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly poNumber: string;
  readonly poSuffix?: string | null;
  readonly vendorName: string;
  readonly vendorId?: string | null;
  readonly sourceType?: FinancialSourceType;
  readonly sourceId?: string | null;
  readonly lineItems: readonly CreatePurchaseOrderLineItemInput[];
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, status: true },
  });
  if (!job) throw new JobNotFoundError(input.jobId);
  if (!acceptsNewCommitments(job.status)) throw new JobNotOpenError(input.jobId, job.status);

  const costCodeIds = [...new Set(input.lineItems.map((item) => item.costCodeId))];
  const known = await db.costCode.findMany({
    where: { id: { in: costCodeIds }, organizationId: input.organizationId },
    select: { id: true, defaultCostType: true },
  });
  if (known.length !== costCodeIds.length) {
    const knownIds = new Set(known.map((code) => code.id));
    throw new UnknownCostCodeError(costCodeIds.filter((id) => !knownIds.has(id)));
  }
  const defaultCostTypeById = new Map(known.map((code) => [code.id, code.defaultCostType]));

  if (input.vendorId) {
    const vendor = await db.vendor.findFirst({ where: { id: input.vendorId, organizationId: input.organizationId }, select: { id: true } });
    if (!vendor) throw new UnknownVendorError(input.vendorId);
  }

  try {
    const purchaseOrder = await db.purchaseOrder.create({
      data: {
        organizationId: input.organizationId,
        jobId: input.jobId,
        poNumber: input.poNumber,
        poSuffix: input.poSuffix ?? null,
        vendorName: input.vendorName,
        vendorId: input.vendorId ?? null,
        sourceType: input.sourceType ?? "SCRATCH",
        sourceId: input.sourceId ?? null,
        lineItems: {
          create: input.lineItems.map((item, index) => ({
            costCodeId: item.costCodeId,
            costType: item.costType ?? defaultCostTypeById.get(item.costCodeId) ?? "NONE",
            title: item.title,
            quantityMilli: item.quantityMilli ?? 1_000,
            unitCostCents: item.unitCostCents,
            sortOrder: index,
          })),
        },
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    const totalCents = purchaseOrder.lineItems.reduce(
      (total, item) => total + extendedCostCents(item.quantityMilli, item.unitCostCents),
      0,
    );

    await emitEvent(input.organizationId, "po.created", {
      purchaseOrderId: purchaseOrder.id,
      jobId: purchaseOrder.jobId,
      poNumber: purchaseOrder.poNumber,
      vendorName: purchaseOrder.vendorName,
      status: purchaseOrder.status,
      totalCents,
    });

    return { ...purchaseOrder, totalCents };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicatePoNumberError(input.poNumber);
    }
    throw error;
  }
}
