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
import { db } from "@/lib/db";

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

  return db.dailyLog.create({
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

export async function importPurchaseOrder(input: ImportPurchaseOrderInput) {
  await assertJob(input.organizationId, input.jobId);
  await assertUser(input.organizationId, input.uploadedByUserId);
  await assertVendor(input.organizationId, input.vendorId);
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

  const totalCents = purchaseOrder.lineItems.reduce(
    (total, item) => total + Math.round((item.quantityMilli * item.unitCostCents) / 1_000),
    0,
  );

  return { ...purchaseOrder, totalCents };
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

  return { ...bill, totalCents };
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

export async function importInvoice(input: ImportInvoiceInput) {
  await assertJob(input.organizationId, input.jobId);
  await assertUser(input.organizationId, input.uploadedByUserId);

  const usesLineItems = input.lineItems !== undefined && input.lineItems.length > 0;
  if (!usesLineItems && input.amountCents === undefined) {
    throw new Error("Provide either lineItems or amountCents.");
  }
  const amountCents = usesLineItems
    ? input.lineItems!.reduce((total, line) => total + line.amountCents, 0)
    : input.amountCents!;

  const paymentsTotalCents = (input.payments ?? []).reduce((total, payment) => total + payment.amountCents, 0);
  if (paymentsTotalCents > amountCents) {
    throw new OverpaidInvoiceError(amountCents, paymentsTotalCents);
  }

  const invoice = await db.invoice.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      type: input.type,
      invoiceNumber: input.invoiceNumber,
      status: input.status,
      amountCents,
      issuedOn: input.issuedOn ?? null,
      dueOn: input.dueOn ?? null,
      paidAt: input.paidAt ?? null,
      voidedAt: input.voidedAt ?? null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      ...(usesLineItems
        ? { lineItems: { create: input.lineItems!.map((line, index) => ({ ...line, sortOrder: index })) } }
        : {}),
      payments: {
        create: (input.payments ?? []).map((payment) => ({
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

  return invoice;
}
