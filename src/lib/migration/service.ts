/**
 * Historical data migration (Buildertrend cutover). Cowork's browser-automation
 * approach to this — click into Buildertrend, read a value, click into WCI OS, type
 * it into a form — cannot see or set fields no form exposes (a bill's original
 * PAID date, a photo attached to a two-year-old daily log) and breaks down entirely
 * on live workflows: every financial create route forces a starting status (a new
 * Bill is always IN_REVIEW) and gates on the job still accepting new commitments, so
 * a bill that Buildertrend shows already paid, on a job Buildertrend has since
 * closed, cannot be entered through the normal UI at all.
 *
 * These import* functions are the structured alternative: one API call per record,
 * carrying the real historical status and dates directly, on any job regardless of
 * its current status. They deliberately do NOT call src/lib/{bills,purchase-orders,
 * invoicing,daily-logs}/service.ts's createX functions — those enforce the live
 * workflow on purpose, and none of that applies to a record that was already fully
 * processed in Buildertrend years ago. What *is* reused is the validation shape
 * (job/cost-code/vendor/PO existence checks) and, for attachments, the same
 * URL-only registration as src/lib/files/service.ts's registerFile — Buildertrend's
 * photos and documents already have durable CDN URLs, so nothing needs re-uploading
 * through Storage.
 *
 * Idempotent on natural keys so a cutover re-run is safe:
 *   - PurchaseOrder: (organizationId, poNumber)
 *   - Invoice: (organizationId, invoiceNumber)
 *   - Bill: (organizationId, jobId, billNumber) when billNumber is present
 *   - DailyLog: (jobId, createdAt, note)
 *   - ScheduleItem: (jobId, title, manualStartDate)
 * An existing match returns `{ created: false }` and does not invent or overwrite
 * financial amounts.
 *
 * Deliberately does not call emitEvent: webhook subscribers (Duke, Jarvis) react to
 * these event types as live signals ("a bill was just paid, act on it"), and a
 * multi-year backlog of migrated history firing through that pipeline in one batch
 * would be noise at best and wrong automation at worst.
 *
 * Also deliberately leaves qboBillId/qboInvoiceId unset: WCI's QuickBooks sync is a
 * manual per-record "Sync to QuickBooks" button, never automatic, so importing here
 * doesn't risk auto-pushing anything — but QBO almost certainly already has these
 * transactions from Buildertrend's own sync, so that button should stay unclicked on
 * migrated records. Worth saying once in the migration runbook, not worth enforcing
 * in code.
 */

import type {
  BillApprovalStatus,
  CostType,
  FileCategory,
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  PurchaseOrderStatus,
} from "@/generated/prisma/enums";
import { EstimateStatus, ProposalStatus, RateMode } from "@/generated/prisma/enums";
import { sendEstimateToBudget } from "@/lib/budget/send-to-budget";
import { db } from "@/lib/db";
import type { BasisPoints, Cents } from "@/lib/money";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`No job ${jobId} in this organization.`);
    this.name = "JobNotFoundError";
  }
}

export class UnknownUserError extends Error {
  constructor(userId: string) {
    super(`No user ${userId} in this organization.`);
    this.name = "UnknownUserError";
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

export class UnknownClientError extends Error {
  constructor(clientId: string) {
    super(`No client ${clientId} in this organization.`);
    this.name = "UnknownClientError";
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

export class OverpaidInvoiceError extends Error {
  constructor(amountCents: number, paymentsTotalCents: number) {
    super(`Payments total ${paymentsTotalCents}c, which is more than the invoice's ${amountCents}c.`);
    this.name = "OverpaidInvoiceError";
  }
}

/** Every import* returns this so callers can tell create vs. re-run no-op apart. */
export interface MigrationImportResult<T> {
  readonly record: T;
  readonly created: boolean;
}

export interface MigrationAttachmentInput {
  readonly url: string;
  readonly fileName: string;
  readonly mimeType?: string | null;
  readonly sizeBytes?: number | null;
  readonly category?: FileCategory;
  /** Defaults to the parent record's historical date when omitted. */
  readonly createdAt?: Date;
}

async function assertJob(organizationId: string, jobId: string): Promise<void> {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(jobId);
}

async function assertUser(organizationId: string, userId: string): Promise<void> {
  const user = await db.user.findFirst({ where: { id: userId, organizationId }, select: { id: true } });
  if (!user) throw new UnknownUserError(userId);
}

async function assertVendor(organizationId: string, vendorId: string | null | undefined): Promise<void> {
  if (!vendorId) return;
  const vendor = await db.vendor.findFirst({ where: { id: vendorId, organizationId }, select: { id: true } });
  if (!vendor) throw new UnknownVendorError(vendorId);
}

async function costTypeByCostCodeId(
  organizationId: string,
  costCodeIds: readonly string[],
): Promise<Map<string, CostType>> {
  const uniqueIds = [...new Set(costCodeIds)];
  const known = await db.costCode.findMany({
    where: { id: { in: uniqueIds }, organizationId },
    select: { id: true, defaultCostType: true },
  });
  if (known.length !== uniqueIds.length) {
    const knownIds = new Set(known.map((code) => code.id));
    throw new UnknownCostCodeError(uniqueIds.filter((id) => !knownIds.has(id)));
  }
  return new Map(known.map((code) => [code.id, code.defaultCostType]));
}

function attachmentCreateInputs(
  attachments: readonly MigrationAttachmentInput[] | undefined,
  defaults: { readonly organizationId: string; readonly jobId: string; readonly uploadedByUserId: string; readonly createdAt: Date },
) {
  return (attachments ?? []).map((attachment) => ({
    organizationId: defaults.organizationId,
    jobId: defaults.jobId,
    uploadedByUserId: defaults.uploadedByUserId,
    fileName: attachment.fileName,
    url: attachment.url,
    mimeType: attachment.mimeType ?? null,
    sizeBytes: attachment.sizeBytes ?? null,
    category: attachment.category ?? ("DOCUMENT" as FileCategory),
    createdAt: attachment.createdAt ?? defaults.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Daily logs
// ---------------------------------------------------------------------------

export interface ImportDailyLogInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly authorUserId: string;
  readonly note: string;
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
  /** The date this log actually documents in Buildertrend — becomes createdAt/updatedAt. */
  readonly createdAt: Date;
  readonly attachments?: readonly MigrationAttachmentInput[];
}

export async function importDailyLog(input: ImportDailyLogInput) {
  await assertJob(input.organizationId, input.jobId);
  await assertUser(input.organizationId, input.authorUserId);

  const existing = await db.dailyLog.findFirst({
    where: {
      jobId: input.jobId,
      organizationId: input.organizationId,
      createdAt: input.createdAt,
      note: input.note,
    },
    include: { files: true },
  });
  if (existing) return { record: existing, created: false };

  const record = await db.dailyLog.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      authorUserId: input.authorUserId,
      note: input.note,
      clientVisible: input.clientVisible ?? true,
      subVisible: input.subVisible ?? true,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      files: {
        create: attachmentCreateInputs(input.attachments, {
          organizationId: input.organizationId,
          jobId: input.jobId,
          uploadedByUserId: input.authorUserId,
          createdAt: input.createdAt,
        }),
      },
    },
    include: { files: true },
  });
  return { record, created: true };
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

export interface ImportPurchaseOrderLineItemInput {
  readonly costCodeId: string;
  readonly costType?: CostType;
  readonly title: string;
  readonly quantityMilli?: number;
  readonly unitCostCents: number;
}

export interface ImportPurchaseOrderInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly uploadedByUserId: string;
  readonly poNumber: string;
  readonly poSuffix?: string | null;
  readonly vendorName: string;
  readonly vendorId?: string | null;
  readonly status: PurchaseOrderStatus;
  readonly approvedAt?: Date | null;
  readonly declinedAt?: Date | null;
  /** When this PO was originally cut in Buildertrend — becomes createdAt. */
  readonly createdAt: Date;
  readonly lineItems: readonly ImportPurchaseOrderLineItemInput[];
  readonly attachments?: readonly MigrationAttachmentInput[];
}

function purchaseOrderTotalCents(
  lineItems: ReadonlyArray<{ quantityMilli: number; unitCostCents: number }>,
): number {
  return lineItems.reduce(
    (total, item) => total + Math.round((item.quantityMilli * item.unitCostCents) / 1_000),
    0,
  );
}

export async function importPurchaseOrder(input: ImportPurchaseOrderInput) {
  await assertJob(input.organizationId, input.jobId);
  await assertUser(input.organizationId, input.uploadedByUserId);
  await assertVendor(input.organizationId, input.vendorId);

  const existing = await db.purchaseOrder.findFirst({
    where: { organizationId: input.organizationId, poNumber: input.poNumber },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, files: true },
  });
  if (existing) {
    return {
      record: { ...existing, totalCents: purchaseOrderTotalCents(existing.lineItems) },
      created: false,
    };
  }

  const defaultCostTypeById = await costTypeByCostCodeId(
    input.organizationId,
    input.lineItems.map((item) => item.costCodeId),
  );

  const purchaseOrder = await db.purchaseOrder.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      poNumber: input.poNumber,
      poSuffix: input.poSuffix ?? null,
      vendorName: input.vendorName,
      vendorId: input.vendorId ?? null,
      status: input.status,
      approvedAt: input.approvedAt ?? null,
      declinedAt: input.declinedAt ?? null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
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
      files: {
        create: attachmentCreateInputs(input.attachments, {
          organizationId: input.organizationId,
          jobId: input.jobId,
          uploadedByUserId: input.uploadedByUserId,
          createdAt: input.createdAt,
        }),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, files: true },
  });

  return {
    record: { ...purchaseOrder, totalCents: purchaseOrderTotalCents(purchaseOrder.lineItems) },
    created: true,
  };
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export interface ImportBillLineItemInput {
  readonly costCodeId: string;
  readonly costType?: CostType;
  readonly title: string;
  readonly amountCents: number;
}

export interface ImportBillInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly uploadedByUserId: string;
  readonly purchaseOrderId?: string | null;
  readonly vendorName: string;
  readonly vendorId?: string | null;
  readonly billNumber?: string | null;
  readonly approvalStatus: BillApprovalStatus;
  readonly issuedOn?: Date | null;
  readonly dueOn?: Date | null;
  readonly paidAt?: Date | null;
  /** When this bill was originally entered in Buildertrend — becomes createdAt. */
  readonly createdAt: Date;
  readonly lineItems: readonly ImportBillLineItemInput[];
  readonly attachments?: readonly MigrationAttachmentInput[];
}

export async function importBill(input: ImportBillInput) {
  await assertJob(input.organizationId, input.jobId);
  await assertUser(input.organizationId, input.uploadedByUserId);
  await assertVendor(input.organizationId, input.vendorId);

  if (input.purchaseOrderId) {
    const po = await db.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, organizationId: input.organizationId },
      select: { id: true, jobId: true },
    });
    if (!po) throw new UnknownPurchaseOrderError(input.purchaseOrderId);
    if (po.jobId !== input.jobId) throw new PurchaseOrderJobMismatchError();
  }

  if (input.billNumber) {
    const existing = await db.bill.findFirst({
      where: {
        organizationId: input.organizationId,
        jobId: input.jobId,
        billNumber: input.billNumber,
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, files: true },
    });
    if (existing) {
      const totalCents = existing.lineItems.reduce((total, item) => total + item.amountCents, 0);
      return { record: { ...existing, totalCents }, created: false };
    }
  }

  const defaultCostTypeById = await costTypeByCostCodeId(
    input.organizationId,
    input.lineItems.map((item) => item.costCodeId),
  );

  const bill = await db.bill.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      purchaseOrderId: input.purchaseOrderId ?? null,
      vendorName: input.vendorName,
      vendorId: input.vendorId ?? null,
      billNumber: input.billNumber ?? null,
      approvalStatus: input.approvalStatus,
      issuedOn: input.issuedOn ?? null,
      dueOn: input.dueOn ?? null,
      paidAt: input.paidAt ?? null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      lineItems: {
        create: input.lineItems.map((item, index) => ({
          costCodeId: item.costCodeId,
          costType: item.costType ?? defaultCostTypeById.get(item.costCodeId) ?? "NONE",
          title: item.title,
          amountCents: item.amountCents,
          sortOrder: index,
        })),
      },
      files: {
        create: attachmentCreateInputs(input.attachments, {
          organizationId: input.organizationId,
          jobId: input.jobId,
          uploadedByUserId: input.uploadedByUserId,
          createdAt: input.createdAt,
        }),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, files: true },
  });

  const totalCents = bill.lineItems.reduce((total, item) => total + item.amountCents, 0);

  return { record: { ...bill, totalCents }, created: true };
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export interface ImportInvoiceLineItemInput {
  readonly title: string;
  readonly description?: string | null;
  readonly amountCents: number;
}

export interface ImportInvoicePaymentInput {
  readonly method: PaymentMethod;
  readonly amountCents: number;
  readonly reference?: string | null;
  readonly receivedAt: Date;
}

export interface ImportInvoiceInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly uploadedByUserId: string;
  readonly type: InvoiceType;
  readonly invoiceNumber: string;
  readonly status: InvoiceStatus;
  /** Freeform title from Buildertrend (e.g. "Draw 1 - Upon Execution (20%)"). */
  readonly title?: string | null;
  readonly amountCents?: number;
  readonly lineItems?: readonly ImportInvoiceLineItemInput[];
  readonly issuedOn?: Date | null;
  readonly dueOn?: Date | null;
  readonly paidAt?: Date | null;
  readonly voidedAt?: Date | null;
  /** When this invoice was originally raised in Buildertrend — becomes createdAt. */
  readonly createdAt: Date;
  readonly payments?: readonly ImportInvoicePaymentInput[];
  readonly attachments?: readonly MigrationAttachmentInput[];
}

/**
 * PAID requires Payment rows that cover the invoice. BT "Paid" with no payment
 * payload becomes SENT so the UI never shows PAID / $0.00 (Candlebark 932-1).
 */
export function invoiceStatusForImport(
  requested: InvoiceStatus,
  amountCents: number,
  payments: readonly ImportInvoicePaymentInput[],
): { status: InvoiceStatus; paidAt: Date | null } {
  if (requested === "VOID" || requested === "DRAFT") {
    return { status: requested, paidAt: null };
  }
  const paidCents = payments.reduce((total, payment) => total + payment.amountCents, 0);
  if (amountCents >= 0) {
    if (paidCents <= 0) return { status: "SENT", paidAt: null };
    if (paidCents >= amountCents) {
      const last = payments.reduce<Date | null>((latest, payment) => {
        if (!latest || payment.receivedAt > latest) return payment.receivedAt;
        return latest;
      }, null);
      return { status: "PAID", paidAt: last };
    }
    return { status: "PARTIALLY_PAID", paidAt: null };
  }
  if (paidCents >= 0) return { status: "SENT", paidAt: null };
  if (paidCents <= amountCents) {
    const last = payments.reduce<Date | null>((latest, payment) => {
      if (!latest || payment.receivedAt > latest) return payment.receivedAt;
      return latest;
    }, null);
    return { status: "PAID", paidAt: last };
  }
  return { status: "PARTIALLY_PAID", paidAt: null };
}

function assertPaymentsFitInvoice(amountCents: number, payments: readonly ImportInvoicePaymentInput[]) {
  const paymentsTotalCents = payments.reduce((total, payment) => total + payment.amountCents, 0);
  // The overpayment guard has to follow the invoice's sign. A negative invoice is a
  // refund or credit — money flowing back to the client — and against one of those a
  // plain `paymentsTotal > amountCents` is true even with no payments at all
  // (0 > -5000), so every refund in a historical import was rejected as overpaid.
  const overpaid = amountCents >= 0 ? paymentsTotalCents > amountCents : paymentsTotalCents < amountCents;
  if (overpaid) {
    throw new OverpaidInvoiceError(amountCents, paymentsTotalCents);
  }
}

/**
 * When an invoice was imported without its payments (or an earlier run hit
 * already_exists before payments were in the payload), a re-run must be able to
 * attach them. Only fills an empty payment set — never overwrites or doubles
 * existing Payment rows (amounts stay frozen once recorded).
 */
async function backfillInvoicePaymentsIfEmpty(
  existing: {
    id: string;
    amountCents: number;
    title: string | null;
    payments: readonly { id: string }[];
    lineItems: unknown;
    files: unknown;
  },
  organizationId: string,
  payments: readonly ImportInvoicePaymentInput[],
  title?: string | null,
) {
  const needsPayments = existing.payments.length === 0 && payments.length > 0;
  const needsTitle = Boolean(title && !existing.title);
  if (!needsPayments && !needsTitle) {
    return { record: existing, created: false as const, paymentsBackfilled: false as const };
  }
  if (needsPayments) {
    assertPaymentsFitInvoice(existing.amountCents, payments);
    await db.payment.createMany({
      data: payments.map((payment) => ({
        organizationId,
        invoiceId: existing.id,
        method: payment.method,
        amountCents: payment.amountCents,
        reference: payment.reference ?? null,
        receivedAt: payment.receivedAt,
        createdAt: payment.receivedAt,
      })),
    });
  }
  const statusUpdate = needsPayments
    ? invoiceStatusForImport("PAID", existing.amountCents, payments)
    : null;
  await db.invoice.update({
    where: { id: existing.id },
    data: {
      ...(needsTitle ? { title } : {}),
      ...(statusUpdate
        ? {
            status: statusUpdate.status,
            paidAt: statusUpdate.paidAt,
            // Migrated BT invoices have no Net 30 — clear the schema default.
            paymentTerms: "CUSTOM",
          }
        : needsTitle
          ? { paymentTerms: "CUSTOM" }
          : {}),
    },
  });
  const refreshed = await db.invoice.findFirstOrThrow({
    where: { id: existing.id },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, payments: true, files: true },
  });
  return { record: refreshed, created: false as const, paymentsBackfilled: needsPayments };
}

export async function importInvoice(input: ImportInvoiceInput) {
  await assertJob(input.organizationId, input.jobId);
  await assertUser(input.organizationId, input.uploadedByUserId);

  const existing = await db.invoice.findFirst({
    where: { organizationId: input.organizationId, invoiceNumber: input.invoiceNumber },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, payments: true, files: true },
  });
  if (existing) {
    return backfillInvoicePaymentsIfEmpty(
      existing,
      input.organizationId,
      input.payments ?? [],
      input.title,
    );
  }

  const usesLineItems = input.lineItems !== undefined && input.lineItems.length > 0;
  if (!usesLineItems && input.amountCents === undefined) {
    throw new Error("Provide either lineItems or amountCents.");
  }
  const amountCents = usesLineItems
    ? input.lineItems!.reduce((total, line) => total + line.amountCents, 0)
    : input.amountCents!;

  const payments = input.payments ?? [];
  assertPaymentsFitInvoice(amountCents, payments);
  const { status, paidAt } = invoiceStatusForImport(input.status, amountCents, payments);

  const invoice = await db.invoice.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      type: input.type,
      invoiceNumber: input.invoiceNumber,
      title: input.title ?? null,
      status,
      // BT exports have no payment-terms column; never invent Net 30.
      paymentTerms: "CUSTOM",
      amountCents,
      issuedOn: input.issuedOn ?? null,
      dueOn: input.dueOn ?? null,
      paidAt: paidAt ?? input.paidAt ?? null,
      voidedAt: input.voidedAt ?? null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      ...(usesLineItems
        ? { lineItems: { create: input.lineItems!.map((line, index) => ({ ...line, sortOrder: index })) } }
        : {}),
      payments: {
        create: payments.map((payment) => ({
          organizationId: input.organizationId,
          method: payment.method,
          amountCents: payment.amountCents,
          reference: payment.reference ?? null,
          receivedAt: payment.receivedAt,
          createdAt: payment.receivedAt,
        })),
      },
      files: {
        create: attachmentCreateInputs(input.attachments, {
          organizationId: input.organizationId,
          jobId: input.jobId,
          uploadedByUserId: input.uploadedByUserId,
          createdAt: input.createdAt,
        }),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, payments: true, files: true },
  });

  return { record: invoice, created: true, paymentsBackfilled: false as const };
}

// ---------------------------------------------------------------------------
// Schedule items
// ---------------------------------------------------------------------------

export interface ImportScheduleItemInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly durationDays: number;
  readonly manualStartDate?: Date | null;
  readonly percentCompleteBasisPoints?: number;
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
  readonly notesInternal?: string | null;
  /** Optional Buildertrend external id for future correlation; stored in notes when set. */
  readonly externalRef?: string | null;
}

/**
 * Ensures the job has a Schedule row, then creates a ScheduleItem. Idempotent on
 * (jobId, title, manualStartDate) — Buildertrend schedule exports have no stable
 * GUID column in the CSV path, so title+start is the durable natural key.
 */
export async function importScheduleItem(input: ImportScheduleItemInput) {
  await assertJob(input.organizationId, input.jobId);

  let schedule = await db.schedule.findFirst({
    where: { organizationId: input.organizationId, jobId: input.jobId },
    orderBy: { createdAt: "asc" },
  });
  if (!schedule) {
    schedule = await db.schedule.create({
      data: {
        organizationId: input.organizationId,
        jobId: input.jobId,
        name: "Schedule",
      },
    });
  }

  const existing = await db.scheduleItem.findFirst({
    where: {
      scheduleId: schedule.id,
      title: input.title,
      ...(input.manualStartDate
        ? { manualStartDate: input.manualStartDate }
        : { manualStartDate: null }),
    },
  });
  if (existing) return { record: existing, created: false };

  const count = await db.scheduleItem.count({ where: { scheduleId: schedule.id } });
  const notesInternal =
    input.externalRef != null && input.externalRef !== ""
      ? [input.notesInternal, `[BT ref: ${input.externalRef}]`].filter(Boolean).join("\n")
      : (input.notesInternal ?? null);

  const record = await db.scheduleItem.create({
    data: {
      scheduleId: schedule.id,
      title: input.title,
      durationDays: input.durationDays,
      manualStartDate: input.manualStartDate ?? null,
      percentCompleteBasisPoints: input.percentCompleteBasisPoints ?? 0,
      clientVisible: input.clientVisible ?? true,
      subVisible: input.subVisible ?? true,
      notesInternal,
      sortOrder: count,
    },
  });
  return { record, created: true };
}

// ---------------------------------------------------------------------------
// Approved proposals (Buildertrend Estimate/Proposals → Estimate + Proposal + budget)
// ---------------------------------------------------------------------------

export interface ImportApprovedProposalLineInput {
  readonly costCodeId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly groupLabel?: string | null;
  readonly costType?: CostType;
  /** Quantity × 1000 (same as live EstimateLineItem). */
  readonly quantityMilli: number;
  readonly unit?: string | null;
  /** Builder unit cost in cents. */
  readonly unitCostCents: Cents;
  /** Markup basis points (21% → 2100). */
  readonly markupBasisPoints: BasisPoints;
  readonly internalNote?: string | null;
}

export interface ImportApprovedProposalInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly clientId: string;
  readonly title: string;
  /**
   * Natural key for idempotency — typically the Buildertrend proposal/print id
   * or a stable "BT:{jobPrefix}:{proposalTitle}" string. Stored on the Estimate
   * as `aiPromptNotes` when created so re-runs can find it without a new column.
   */
  readonly externalKey: string;
  readonly lineItems: readonly ImportApprovedProposalLineInput[];
  readonly clientSignatureName?: string | null;
  readonly clientSignedAt?: Date | null;
  readonly coverMessage?: string | null;
  /** When true (default), call sendEstimateToBudget after creating the estimate. */
  readonly sendToBudget?: boolean;
}

export interface ImportApprovedProposalResult {
  readonly estimateId: string;
  readonly proposalId: string;
  readonly created: boolean;
  readonly budgetLinesWritten: number;
}

/**
 * Import a Buildertrend-approved proposal as a locked Estimate + ACCEPTED Proposal
 * and (by default) send the estimate to the job budget. Does NOT run acceptProposal()
 * — that would try PRE_SALE→OPEN and e-sign flows that don't apply to an already-OPEN
 * migrated job. Idempotent on Estimate.aiPromptNotes === `bt-proposal:{externalKey}`.
 */
export async function importApprovedProposal(
  input: ImportApprovedProposalInput,
): Promise<ImportApprovedProposalResult> {
  await assertJob(input.organizationId, input.jobId);
  const client = await db.client.findFirst({
    where: { id: input.clientId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!client) throw new UnknownClientError(input.clientId);

  const marker = `bt-proposal:${input.externalKey}`;
  const existingEstimate = await db.estimate.findFirst({
    where: { organizationId: input.organizationId, jobId: input.jobId, aiPromptNotes: marker },
    include: { lineItems: true },
  });
  if (existingEstimate) {
    const existingProposal = await db.proposal.findFirst({
      where: {
        organizationId: input.organizationId,
        jobId: input.jobId,
        options: { some: { estimateId: existingEstimate.id } },
      },
    });
    return {
      estimateId: existingEstimate.id,
      proposalId: existingProposal?.id ?? "",
      created: false,
      budgetLinesWritten: 0,
    };
  }

  if (input.lineItems.length === 0) {
    throw new Error("importApprovedProposal requires at least one line item from Buildertrend.");
  }

  const costCodeIds = [...new Set(input.lineItems.map((line) => line.costCodeId))];
  const known = await db.costCode.findMany({
    where: { id: { in: costCodeIds }, organizationId: input.organizationId },
    select: { id: true, defaultCostType: true },
  });
  if (known.length !== costCodeIds.length) {
    const knownIds = new Set(known.map((code) => code.id));
    throw new UnknownCostCodeError(costCodeIds.filter((id) => !knownIds.has(id)));
  }
  const defaultCostTypeById = new Map(known.map((code) => [code.id, code.defaultCostType]));

  const estimate = await db.estimate.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      status: EstimateStatus.DRAFT,
      rateMode: RateMode.MARKUP,
      defaultRateBasisPoints: 0,
      aiGenerated: false,
      aiPromptNotes: marker,
      lineItems: {
        create: input.lineItems.map((line, index) => ({
          costCodeId: line.costCodeId,
          costType: line.costType ?? defaultCostTypeById.get(line.costCodeId) ?? "NONE",
          title: line.title,
          description: line.description ?? null,
          quantityMilli: line.quantityMilli,
          unit: line.unit?.trim() || null,
          unitCostCents: line.unitCostCents,
          rateMode: RateMode.MARKUP,
          rateBasisPoints: line.markupBasisPoints,
          taxable: false,
          internalNote: line.internalNote ?? null,
          groupLabel: line.groupLabel ?? null,
          sortOrder: index,
        })),
      },
    },
  });

  let budgetLinesWritten = 0;
  if (input.sendToBudget !== false) {
    const budget = await sendEstimateToBudget({
      estimateId: estimate.id,
      organizationId: input.organizationId,
    });
    budgetLinesWritten = budget.budgetLinesWritten;
  }

  const proposal = await db.proposal.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      clientId: input.clientId,
      title: input.title,
      coverMessage: input.coverMessage ?? null,
      status: ProposalStatus.ACCEPTED,
      clientSignatureName: input.clientSignatureName ?? null,
      clientSignedAt: input.clientSignedAt ?? null,
      sentAt: input.clientSignedAt ?? new Date(),
      options: {
        create: [{ estimateId: estimate.id, label: "Accepted", sortOrder: 0 }],
      },
    },
    include: { options: true },
  });

  const selectedOptionId = proposal.options[0]?.id;
  if (selectedOptionId) {
    await db.proposal.update({
      where: { id: proposal.id },
      data: { selectedOptionId },
    });
  }

  return {
    estimateId: estimate.id,
    proposalId: proposal.id,
    created: true,
    budgetLinesWritten,
  };
}
