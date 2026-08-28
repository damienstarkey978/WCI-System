/**
 * Bill creation — extracted from src/app/api/v1/bills/route.ts so a second caller
 * (AI receipt/bill OCR, Phase 8) can create a real Bill through the exact same
 * validation path instead of a parallel copy of it. Behavior is unchanged from the
 * original route: the same checks, in the same order, with the same error meanings.
 */

import { BillApprovalStatus } from "@/generated/prisma/enums";
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

export class BillNotFoundError extends Error {
  constructor(billId: string) {
    super(`No bill ${billId} in this organization.`);
    this.name = "BillNotFoundError";
  }
}

export class IllegalBillTransitionError extends Error {
  constructor(
    public readonly currentStatus: BillApprovalStatus,
    public readonly attemptedStatus: BillApprovalStatus,
    public readonly allowed: readonly BillApprovalStatus[],
  ) {
    super(`A ${currentStatus} bill cannot move to ${attemptedStatus}.`);
    this.name = "IllegalBillTransitionError";
  }
}

/**
 * IN_REVIEW → APPROVED → READY_FOR_PAYMENT → PAID, with VOID reachable from any
 * unpaid state. The transitions are guarded because each one moves money in the
 * funnel: reaching PAID is what makes a bill count as actual cost under cash basis.
 */
const ALLOWED_BILL_TRANSITIONS: Readonly<Record<BillApprovalStatus, readonly BillApprovalStatus[]>> = {
  [BillApprovalStatus.IN_REVIEW]: [BillApprovalStatus.APPROVED, BillApprovalStatus.VOID],
  [BillApprovalStatus.APPROVED]: [
    BillApprovalStatus.READY_FOR_PAYMENT,
    BillApprovalStatus.IN_REVIEW,
    BillApprovalStatus.VOID,
  ],
  [BillApprovalStatus.READY_FOR_PAYMENT]: [
    BillApprovalStatus.PAID,
    BillApprovalStatus.APPROVED,
    BillApprovalStatus.VOID,
  ],
  // A paid bill is settled. Correcting one means voiding and re-entering it, so the
  // correction leaves a trail instead of quietly rewriting history.
  [BillApprovalStatus.PAID]: [],
  [BillApprovalStatus.VOID]: [],
};

export async function updateBillStatus(organizationId: string, billId: string, approvalStatus: BillApprovalStatus) {
  const bill = await db.bill.findFirst({ where: { id: billId, organizationId }, include: { lineItems: true } });
  if (!bill) throw new BillNotFoundError(billId);

  if (bill.approvalStatus === approvalStatus) {
    return { ...bill, unchanged: true as const };
  }

  if (!ALLOWED_BILL_TRANSITIONS[bill.approvalStatus].includes(approvalStatus)) {
    throw new IllegalBillTransitionError(bill.approvalStatus, approvalStatus, ALLOWED_BILL_TRANSITIONS[bill.approvalStatus]);
  }

  const updated = await db.bill.update({
    where: { id: bill.id },
    data: {
      approvalStatus,
      paidAt: approvalStatus === BillApprovalStatus.PAID ? (bill.paidAt ?? new Date()) : bill.paidAt,
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  const totalCents = updated.lineItems.reduce((total, item) => total + item.amountCents, 0);
  const eventPayload = {
    billId: updated.id,
    jobId: updated.jobId,
    purchaseOrderId: updated.purchaseOrderId,
    vendorName: updated.vendorName,
    approvalStatus: updated.approvalStatus,
    totalCents,
  };

  if (approvalStatus === BillApprovalStatus.READY_FOR_PAYMENT) {
    await emitEvent(organizationId, "bill.ready_for_payment", eventPayload);
  } else if (approvalStatus === BillApprovalStatus.PAID) {
    await emitEvent(organizationId, "bill.paid", eventPayload);
  }

  return { ...updated, totalCents, unchanged: false as const };
}
