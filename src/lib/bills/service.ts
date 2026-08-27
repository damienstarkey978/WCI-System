/**
 * Bill creation — extracted from src/app/api/v1/bills/route.ts so a second caller
 * (AI receipt/bill OCR, Phase 8) can create a real Bill through the exact same
 * validation path instead of a parallel copy of it. Behavior is unchanged from the
 * original route: the same checks, in the same order, with the same error meanings.
 */

import { db } from "@/lib/db";
import { acceptsNewCommitments } from "@/lib/job-status";
import { emitEvent } from "@/lib/webhooks";
import type { CostType } from "@/generated/prisma/enums";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`No job ${jobId} in this organization.`);
    this.name = "JobNotFoundError";
  }
}

export class JobNotOpenError extends Error {
  constructor(jobId: string, status: string) {
    super(`Job ${jobId} is ${status} and cannot take new bills.`);
    this.name = "JobNotOpenError";
  }
}

export class UnknownPurchaseOrderError extends Error {
  constructor(purchaseOrderId: string) {
    super(`No purchase order ${purchaseOrderId}.`);
    this.name = "UnknownPurchaseOrderError";
  }
}

export class PurchaseOrderJobMismatchError extends Error {
  constructor() {
    super("That purchase order belongs to a different job.");
    this.name = "PurchaseOrderJobMismatchError";
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

export interface CreateBillLineItemInput {
  readonly costCodeId: string;
  readonly costType?: CostType;
  readonly title: string;
  readonly amountCents: number;
}

export interface CreateBillInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly purchaseOrderId?: string | null;
  readonly vendorName: string;
  readonly vendorId?: string | null;
  readonly billNumber?: string | null;
  readonly issuedOn?: Date | null;
  readonly dueOn?: Date | null;
  readonly fromOcr?: boolean;
  readonly lineItems: readonly CreateBillLineItemInput[];
}

export async function createBill(input: CreateBillInput) {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, status: true },
  });
  if (!job) throw new JobNotFoundError(input.jobId);
  if (!acceptsNewCommitments(job.status)) throw new JobNotOpenError(input.jobId, job.status);

  if (input.purchaseOrderId) {
    const po = await db.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, organizationId: input.organizationId },
      select: { id: true, jobId: true },
    });
    if (!po) throw new UnknownPurchaseOrderError(input.purchaseOrderId);
    // A bill billed against a PO on a different job would corrupt both budgets.
    if (po.jobId !== input.jobId) throw new PurchaseOrderJobMismatchError();
  }

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

  const bill = await db.bill.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      purchaseOrderId: input.purchaseOrderId ?? null,
      vendorName: input.vendorName,
      vendorId: input.vendorId ?? null,
      billNumber: input.billNumber ?? null,
      issuedOn: input.issuedOn ?? null,
      dueOn: input.dueOn ?? null,
      fromOcr: input.fromOcr ?? false,
      lineItems: {
        create: input.lineItems.map((item, index) => ({
          costCodeId: item.costCodeId,
          costType: item.costType ?? defaultCostTypeById.get(item.costCodeId) ?? "NONE",
          title: item.title,
          amountCents: item.amountCents,
          sortOrder: index,
        })),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  const totalCents = bill.lineItems.reduce((total, item) => total + item.amountCents, 0);

  await emitEvent(input.organizationId, "bill.created", {
    billId: bill.id,
    jobId: bill.jobId,
    purchaseOrderId: bill.purchaseOrderId,
    vendorName: bill.vendorName,
    approvalStatus: bill.approvalStatus,
    totalCents,
  });

  return { ...bill, totalCents };
}
