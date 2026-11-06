/**
 * Bill creation — extracted from src/app/api/v1/bills/route.ts so a second caller
 * (AI receipt/bill OCR, Phase 8) can create a real Bill through the exact same
 * validation path instead of a parallel copy of it. Behavior is unchanged from the
 * original route: the same checks, in the same order, with the same error meanings.
 */

import { BillApprovalStatus } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/actor";
import { creatorColumns } from "@/lib/actor";
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

export class UnknownScheduleItemError extends Error {
  constructor(scheduleItemId: string) {
    super(`No schedule item ${scheduleItemId} on this job.`);
    this.name = "UnknownScheduleItemError";
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
  readonly title?: string | null;
  readonly description?: string | null;
  readonly issuedOn?: Date | null;
  readonly dueOn?: Date | null;
  readonly linkedScheduleItemId?: string | null;
  readonly fromOcr?: boolean;
  /** Create-Bill / Ready-for-Payment QuickBooks intent (null = unset). */
  readonly sendToQuickBooks?: boolean | null;
  readonly quickBooksSkipReason?: string | null;
  /** Buildertrend "Mark as Billable to Client". */
  readonly billableToClient?: boolean;
  /** Optional initial pipeline status (defaults IN_REVIEW). */
  readonly approvalStatus?: "INBOX" | "IN_REVIEW" | "READY_FOR_PAYMENT";
  /** @deprecated Prefer `actor` — kept so staff actions that already pass user id keep working. */
  readonly createdByUserId?: string | null;
  /** Browser User XOR API key — stamped on createdBy* columns. */
  readonly actor?: Actor;
  readonly lineItems: readonly CreateBillLineItemInput[];
}

export class InventedBillNumberError extends Error {
  constructor(billNumber: string) {
    super(
      `Bill number "${billNumber}" looks like an OS-invented JOB_ prefix — use the vendor's real invoice number only (Money rule 2).`,
    );
    this.name = "InventedBillNumberError";
  }
}

export async function createBill(input: CreateBillInput) {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, status: true },
  });
  if (!job) throw new JobNotFoundError(input.jobId);
  if (!acceptsNewCommitments(job.status)) throw new JobNotOpenError(input.jobId, job.status);

  const { isInventedJobPrefixedBillNumber, normalizeVendorInvoiceNumber } = await import("@/lib/bills/bill-number");
  const normalizedNumber = normalizeVendorInvoiceNumber(input.billNumber);
  if (normalizedNumber && isInventedJobPrefixedBillNumber(normalizedNumber)) {
    throw new InventedBillNumberError(normalizedNumber);
  }

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

  if (input.linkedScheduleItemId) {
    const item = await db.scheduleItem.findFirst({
      where: {
        id: input.linkedScheduleItemId,
        schedule: { jobId: input.jobId, organizationId: input.organizationId },
      },
      select: { id: true },
    });
    if (!item) throw new UnknownScheduleItemError(input.linkedScheduleItemId);
  }

  const bill = await db.bill.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      purchaseOrderId: input.purchaseOrderId ?? null,
      vendorName: input.vendorName,
      vendorId: input.vendorId ?? null,
      billNumber: normalizedNumber,
      title: input.title ?? null,
      description: input.description ?? null,
      issuedOn: input.issuedOn ?? null,
      dueOn: input.dueOn ?? null,
      linkedScheduleItemId: input.linkedScheduleItemId ?? null,
      fromOcr: input.fromOcr ?? false,
      sendToQuickBooks: input.sendToQuickBooks ?? null,
      quickBooksSkipReason: input.quickBooksSkipReason ?? null,
      billableToClient: input.billableToClient ?? false,
      approvalStatus: input.approvalStatus ?? "IN_REVIEW",
      ...(input.actor
        ? creatorColumns(input.actor)
        : {
            createdByUserId: input.createdByUserId ?? null,
            createdByApiKeyId: null,
          }),
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

/** PAID/VOID bills are settled records — edit would rewrite payment history. */
export class BillNotEditableError extends Error {
  constructor(billId: string, status: string) {
    super(`Bill ${billId} is ${status} and cannot be edited.`);
    this.name = "BillNotEditableError";
  }
}

export interface UpdateBillInput {
  readonly organizationId: string;
  readonly billId: string;
  readonly title?: string | null;
  readonly billNumber?: string | null;
  readonly description?: string | null;
  readonly issuedOn?: Date | null;
  readonly dueOn?: Date | null;
  readonly sendToQuickBooks?: boolean | null;
  readonly quickBooksSkipReason?: string | null;
  readonly billableToClient?: boolean;
}

/**
 * Edit bill header + QuickBooks / billable intent. Line items stay on create for now;
 * status transitions stay on updateBillStatus. Refuses PAID/VOID.
 */
export async function updateBill(input: UpdateBillInput) {
  const existing = await db.bill.findFirst({
    where: { id: input.billId, organizationId: input.organizationId },
    select: { id: true, approvalStatus: true },
  });
  if (!existing) throw new BillNotFoundError(input.billId);
  if (
    existing.approvalStatus === BillApprovalStatus.PAID ||
    existing.approvalStatus === BillApprovalStatus.VOID
  ) {
    throw new BillNotEditableError(input.billId, existing.approvalStatus);
  }

  const { isInventedJobPrefixedBillNumber, normalizeVendorInvoiceNumber } = await import("@/lib/bills/bill-number");
  const normalizedNumber =
    input.billNumber === undefined ? undefined : normalizeVendorInvoiceNumber(input.billNumber);
  if (normalizedNumber && isInventedJobPrefixedBillNumber(normalizedNumber)) {
    throw new InventedBillNumberError(normalizedNumber);
  }

  return db.bill.update({
    where: { id: existing.id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(normalizedNumber !== undefined ? { billNumber: normalizedNumber } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.issuedOn !== undefined ? { issuedOn: input.issuedOn } : {}),
      ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}),
      ...(input.sendToQuickBooks !== undefined ? { sendToQuickBooks: input.sendToQuickBooks } : {}),
      ...(input.quickBooksSkipReason !== undefined
        ? { quickBooksSkipReason: input.quickBooksSkipReason }
        : {}),
      ...(input.billableToClient !== undefined ? { billableToClient: input.billableToClient } : {}),
    },
  });
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
 * READY_FOR_PAYMENT must record whether the bill should post to QuickBooks.
 * Materials stay WCI-only; labor/unpaid services may send — never inferred silently.
 */
export class BillQuickBooksIntentRequiredError extends Error {
  constructor() {
    super(
      "sendToQuickBooks is required when marking a bill READY_FOR_PAYMENT (true = push to QuickBooks, false = keep in WCI only).",
    );
    this.name = "BillQuickBooksIntentRequiredError";
  }
}

export interface UpdateBillStatusOptions {
  /** Required when approvalStatus is READY_FOR_PAYMENT. */
  readonly sendToQuickBooks?: boolean;
  /** Stored when sendToQuickBooks is false. */
  readonly quickBooksSkipReason?: string | null;
  /**
   * Real payment calendar date when marking PAID (Money rule 7). Prefer this over
   * relying on paidAt (which may be call time). Used as QBO BillPayment TxnDate.
   */
  readonly paidOn?: Date | null;
  /** Payment method label when marking PAID (check, ACH, Bill.com, …). */
  readonly paidMethod?: string | null;
  /** Optional actor label for QBO audit log (Money rule 9). */
  readonly actorLabel?: string | null;
}

/**
 * INBOX → IN_REVIEW → APPROVED → READY_FOR_PAYMENT → PAID, with VOID reachable from
 * any unpaid state. The transitions are guarded because each one moves money in the
 * funnel: reaching PAID is what makes a bill count as actual cost under cash basis.
 *
 * INBOX is the arrival stage for uploaded/forwarded receipts nobody has opened yet
 * (src/lib/bills/intake.ts). It can only go forward to IN_REVIEW — an unread receipt
 * can't skip straight to approved.
 */
const ALLOWED_BILL_TRANSITIONS: Readonly<Record<BillApprovalStatus, readonly BillApprovalStatus[]>> = {
  [BillApprovalStatus.INBOX]: [BillApprovalStatus.IN_REVIEW, BillApprovalStatus.VOID],
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

export async function updateBillStatus(
  organizationId: string,
  billId: string,
  approvalStatus: BillApprovalStatus,
  options: UpdateBillStatusOptions = {},
) {
  const bill = await db.bill.findFirst({ where: { id: billId, organizationId }, include: { lineItems: true } });
  if (!bill) throw new BillNotFoundError(billId);

  if (bill.approvalStatus === approvalStatus) {
    return { ...bill, unchanged: true as const };
  }

  if (!ALLOWED_BILL_TRANSITIONS[bill.approvalStatus].includes(approvalStatus)) {
    throw new IllegalBillTransitionError(bill.approvalStatus, approvalStatus, ALLOWED_BILL_TRANSITIONS[bill.approvalStatus]);
  }

  // Money only moves once every assigned approver has actually signed. Imported
  // dynamically because intake.ts imports BillNotFoundError from this file, and a
  // static import both ways is a cycle.
  if (approvalStatus === BillApprovalStatus.READY_FOR_PAYMENT) {
    if (typeof options.sendToQuickBooks !== "boolean") {
      throw new BillQuickBooksIntentRequiredError();
    }
    const { requireApprovalsComplete } = await import("@/lib/bills/intake");
    await requireApprovalsComplete(organizationId, bill.id);
  }

  const sendToQuickBooks =
    approvalStatus === BillApprovalStatus.READY_FOR_PAYMENT ? options.sendToQuickBooks! : undefined;

  let quickBooksSkipReason: string | null | undefined;
  if (approvalStatus === BillApprovalStatus.READY_FOR_PAYMENT) {
    if (sendToQuickBooks) {
      quickBooksSkipReason = null;
    } else {
      const trimmed = options.quickBooksSkipReason?.trim() || null;
      const { DEFAULT_MATERIALS_SKIP_REASON, defaultSkipReasonForSuggestion, suggestSendToQuickBooks } = await import(
        "@/lib/bills/quickbooks-intent"
      );
      const suggestion = suggestSendToQuickBooks(bill.lineItems);
      quickBooksSkipReason = trimmed ?? defaultSkipReasonForSuggestion(suggestion) ?? DEFAULT_MATERIALS_SKIP_REASON;
    }
  }

  const paidMethod =
    approvalStatus === BillApprovalStatus.PAID
      ? options.paidMethod?.trim() || bill.paidMethod
      : bill.paidMethod;
  const paidOn =
    approvalStatus === BillApprovalStatus.PAID
      ? (options.paidOn ?? bill.paidOn ?? null)
      : bill.paidOn;

  const updated = await db.bill.update({
    where: { id: bill.id },
    data: {
      approvalStatus,
      // paidAt remains "when OS recorded PAID" for funnel/audit; paidOn is the real date.
      paidAt: approvalStatus === BillApprovalStatus.PAID ? (bill.paidAt ?? new Date()) : bill.paidAt,
      ...(approvalStatus === BillApprovalStatus.PAID ? { paidOn, paidMethod } : {}),
      ...(approvalStatus === BillApprovalStatus.READY_FOR_PAYMENT
        ? { sendToQuickBooks, quickBooksSkipReason }
        : {}),
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
    sendToQuickBooks: updated.sendToQuickBooks,
    quickBooksSkipReason: updated.quickBooksSkipReason,
  };

  if (approvalStatus === BillApprovalStatus.READY_FOR_PAYMENT) {
    await emitEvent(organizationId, "bill.ready_for_payment", eventPayload);
    // Opt-in push only. Soft-fail when QB isn't configured/connected or the API
    // errors — the bill stays READY_FOR_PAYMENT with sendToQuickBooks=true so a
    // later Sync (or reconnect) can finish the create without redoing AP.
    if (sendToQuickBooks) {
      await trySyncBillToQuickBooksAfterReady(organizationId, updated.id);
    }
  } else if (approvalStatus === BillApprovalStatus.PAID) {
    await emitEvent(organizationId, "bill.paid", eventPayload);
    // Money rule 7: if this bill was pushed to QBO, record BillPayment so Bill.com
    // does not keep it unpaid. Soft-fail — WCI PAID stands either way.
    if (updated.qboBillId) {
      const { tryRecordBillPaymentInQuickBooks } = await import("@/lib/quickbooks/sync/bill-payments");
      await tryRecordBillPaymentInQuickBooks(organizationId, updated.id, {
        actorLabel: options.actorLabel ?? null,
      });
    }
  } else if (approvalStatus === BillApprovalStatus.VOID) {
    // Money rule 8: void/delete the linked QBO bill so orphans do not stay payable.
    if (bill.qboBillId) {
      const { tryDeleteLinkedQuickBooksBill } = await import("@/lib/quickbooks/sync/bill-void");
      await tryDeleteLinkedQuickBooksBill(organizationId, bill.id, {
        actorLabel: options.actorLabel ?? null,
        operation: "void",
      });
    }
  }

  return { ...updated, totalCents, unchanged: false as const };
}

/** Best-effort QB create after READY_FOR_PAYMENT opt-in. Never rolls back status. */
async function trySyncBillToQuickBooksAfterReady(organizationId: string, billId: string): Promise<void> {
  try {
    const { syncBillToQuickBooks } = await import("@/lib/quickbooks/sync/bills");
    await syncBillToQuickBooks(organizationId, billId);
  } catch {
    // syncBillToQuickBooks already writes the sync-log failure row when it got that far.
  }
}
