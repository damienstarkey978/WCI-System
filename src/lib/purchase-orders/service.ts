/**
 * Purchase order creation — extracted from src/app/api/v1/purchase-orders/route.ts
 * (mirroring src/lib/bills/service.ts) so a second caller (the staff Purchase
 * Orders page) can create a real PurchaseOrder through the exact same validation
 * path instead of a parallel copy of it. Behavior is unchanged from the original
 * route: the same checks, in the same order, with the same error meanings.
 */

import { Prisma } from "@/generated/prisma/client";
import type { CostType, FinancialSourceType } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/actor";
import { actorColumns } from "@/lib/actor";
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

export class UnknownAgreementTemplateError extends Error {
  constructor(templateId: string) {
    super(`No PO agreement template ${templateId} in this organization.`);
    this.name = "UnknownAgreementTemplateError";
  }
}

export class UnknownScheduleItemError extends Error {
  constructor(scheduleItemId: string) {
    super(`No schedule item ${scheduleItemId} on this job.`);
    this.name = "UnknownScheduleItemError";
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

  /** Short label for the PO — "Install Shower Pan" rather than just "0036". */
  readonly title?: string | null;
  readonly materialsOnly?: boolean;
  /** Buildertrend "Mark as a Variance PO" — display/filter only. */
  readonly isVariance?: boolean;
  readonly scheduledCompletionOn?: Date | null;
  readonly completedOn?: Date | null;
  /** Optional schedule task this PO's work is tied to (BT "Link to Schedule"). */
  readonly linkedScheduleItemId?: string | null;
  /**
   * The subcontractor agreement text. When agreementTemplateId is given and this is
   * not, the template's body is copied in — copied, not referenced, so editing the
   * template later never changes an agreement a vendor already accepted.
   */
  readonly scopeOfWork?: string | null;
  readonly agreementTemplateId?: string | null;
  /** Staff-only; never rendered in the vendor portal. */
  readonly internalNotes?: string | null;
  /** Who created the PO — browser User or API key. Stamped on the CREATED event. */
  readonly actor?: Actor;
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

  // An explicit scopeOfWork always wins; a template only fills the gap when none was
  // typed. The body is copied here rather than read through the relation at display
  // time, so later edits to the template can't rewrite an agreement in flight.
  let scopeOfWork = input.scopeOfWork ?? null;
  if (input.agreementTemplateId) {
    const template = await db.pOAgreementTemplate.findFirst({
      where: { id: input.agreementTemplateId, organizationId: input.organizationId },
      select: { id: true, body: true },
    });
    if (!template) throw new UnknownAgreementTemplateError(input.agreementTemplateId);
    if (scopeOfWork === null) scopeOfWork = template.body;
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
        title: input.title ?? null,
        materialsOnly: input.materialsOnly ?? false,
        isVariance: input.isVariance ?? false,
        scheduledCompletionOn: input.scheduledCompletionOn ?? null,
        completedOn: input.completedOn ?? null,
        linkedScheduleItemId: input.linkedScheduleItemId ?? null,
        scopeOfWork,
        agreementTemplateId: input.agreementTemplateId ?? null,
        internalNotes: input.internalNotes ?? null,
        events: {
          create: {
            type: "CREATED",
            version: 1,
            ...actorColumns(input.actor),
          },
        },
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

export class PurchaseOrderNotFoundForUpdateError extends Error {
  constructor(purchaseOrderId: string) {
    super(`No purchase order ${purchaseOrderId} in this organization.`);
    this.name = "PurchaseOrderNotFoundForUpdateError";
  }
}

export class PurchaseOrderLockedError extends Error {
  constructor(status: string) {
    super(`A ${status} purchase order cannot be edited in place — amend it first.`);
    this.name = "PurchaseOrderLockedError";
  }
}

/**
 * Staff edit of general fields on a DRAFT / DECLINED / PENDING_APPROVAL PO
 * (Buildertrend pencil-modal Save). Does not bump version or clear acceptance —
 * those stay on amendPurchaseOrder. APPROVED / COMPLETED / CANCELLED must go
 * through amend (or are terminal).
 */
export interface UpdatePurchaseOrderInput {
  readonly organizationId: string;
  readonly purchaseOrderId: string;
  readonly title?: string | null;
  readonly vendorName?: string;
  readonly vendorId?: string | null;
  readonly materialsOnly?: boolean;
  readonly isVariance?: boolean;
  readonly scheduledCompletionOn?: Date | null;
  readonly completedOn?: Date | null;
  readonly linkedScheduleItemId?: string | null;
  readonly scopeOfWork?: string | null;
  readonly internalNotes?: string | null;
  readonly poNumber?: string;
}

const EDITABLE_STATUSES = new Set(["DRAFT", "DECLINED", "PENDING_APPROVAL"]);

export async function updatePurchaseOrder(input: UpdatePurchaseOrderInput) {
  const existing = await db.purchaseOrder.findFirst({
    where: { id: input.purchaseOrderId, organizationId: input.organizationId },
    select: { id: true, jobId: true, status: true, poNumber: true },
  });
  if (!existing) throw new PurchaseOrderNotFoundForUpdateError(input.purchaseOrderId);
  if (!EDITABLE_STATUSES.has(existing.status)) {
    throw new PurchaseOrderLockedError(existing.status);
  }

  if (input.vendorId) {
    const vendor = await db.vendor.findFirst({
      where: { id: input.vendorId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!vendor) throw new UnknownVendorError(input.vendorId);
  }

  if (input.linkedScheduleItemId) {
    const item = await db.scheduleItem.findFirst({
      where: {
        id: input.linkedScheduleItemId,
        schedule: { jobId: existing.jobId, organizationId: input.organizationId },
      },
      select: { id: true },
    });
    if (!item) throw new UnknownScheduleItemError(input.linkedScheduleItemId);
  }

  const poNumber = input.poNumber?.trim();
  if (poNumber && poNumber !== existing.poNumber) {
    const clash = await db.purchaseOrder.findFirst({
      where: {
        organizationId: input.organizationId,
        poNumber,
        NOT: { id: existing.id },
      },
      select: { id: true },
    });
    if (clash) throw new DuplicatePoNumberError(poNumber);
  }

  try {
    return await db.purchaseOrder.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.vendorName !== undefined ? { vendorName: input.vendorName } : {}),
        ...(input.vendorId !== undefined ? { vendorId: input.vendorId } : {}),
        ...(input.materialsOnly !== undefined ? { materialsOnly: input.materialsOnly } : {}),
        ...(input.isVariance !== undefined ? { isVariance: input.isVariance } : {}),
        ...(input.scheduledCompletionOn !== undefined
          ? { scheduledCompletionOn: input.scheduledCompletionOn }
          : {}),
        ...(input.completedOn !== undefined ? { completedOn: input.completedOn } : {}),
        ...(input.linkedScheduleItemId !== undefined
          ? { linkedScheduleItemId: input.linkedScheduleItemId }
          : {}),
        ...(input.scopeOfWork !== undefined ? { scopeOfWork: input.scopeOfWork } : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
        ...(poNumber ? { poNumber } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicatePoNumberError(poNumber ?? existing.poNumber);
    }
    throw error;
  }
}
