/**
 * Takeoffs + purchasing intents — AI/hand quantity lines for a job, with explicit
 * conversion to Duke's queue or a PurchaseOrder (never silent).
 */

import {
  FinancialSourceType,
  PurchasingIntentStatus,
  TakeoffLineStatus,
  TakeoffStatus,
  type CostType,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { listJobPlanFiles } from "@/lib/files/service";
import { createPurchaseOrder, DuplicatePoNumberError } from "@/lib/purchase-orders/service";
import { emitEvent } from "@/lib/webhooks";

export class TakeoffNotFoundError extends Error {
  constructor(takeoffId: string) {
    super(`Takeoff ${takeoffId} not found.`);
    this.name = "TakeoffNotFoundError";
  }
}

export class TakeoffLineNotFoundError extends Error {
  constructor() {
    super("One or more takeoff lines were not found on this takeoff.");
    this.name = "TakeoffLineNotFoundError";
  }
}

export class TakeoffLinesNotConvertibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TakeoffLinesNotConvertibleError";
  }
}

export class PurchasingIntentNotFoundError extends Error {
  constructor(intentId: string) {
    super(`Purchasing intent ${intentId} not found.`);
    this.name = "PurchasingIntentNotFoundError";
  }
}

export class PurchasingIntentNotConvertibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchasingIntentNotConvertibleError";
  }
}

export interface CreateTakeoffLineInput {
  readonly costCodeId: string;
  readonly costType?: CostType;
  readonly title: string;
  readonly description?: string | null;
  readonly quantityMilli: number;
  readonly unit?: string | null;
  readonly unitCostCents?: number;
  readonly groupLabel?: string | null;
  readonly confidence?: "HIGH" | "MEDIUM" | "LOW" | null;
}

export interface CreateTakeoffInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly notes?: string | null;
  readonly aiGenerated?: boolean;
  readonly aiPromptNotes?: string | null;
  readonly assumptions?: readonly string[];
  readonly lineItems: readonly CreateTakeoffLineInput[];
  readonly status?: TakeoffStatus;
}

export async function createTakeoff(input: CreateTakeoffInput) {
  return db.takeoff.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      notes: input.notes ?? null,
      aiGenerated: input.aiGenerated ?? false,
      aiPromptNotes: input.aiPromptNotes ?? null,
      assumptions: input.assumptions ? [...input.assumptions] : [],
      status: input.status ?? TakeoffStatus.DRAFT,
      lines: {
        create: input.lineItems.map((line, index) => ({
          costCodeId: line.costCodeId,
          costType: line.costType ?? "NONE",
          title: line.title,
          description: line.description ?? null,
          quantityMilli: line.quantityMilli,
          unit: line.unit ?? null,
          unitCostCents: line.unitCostCents ?? 0,
          groupLabel: line.groupLabel ?? null,
          confidence: line.confidence ?? null,
          sortOrder: index,
          status: TakeoffLineStatus.DRAFT,
        })),
      },
    },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: { costCode: { select: { id: true, code: true, name: true } } },
      },
    },
  });
}

const takeoffPlanFileInclude = {
  file: {
    select: {
      id: true,
      fileName: true,
      url: true,
      mimeType: true,
      sizeBytes: true,
      category: true,
      createdAt: true,
      deletedAt: true,
    },
  },
} as const;

export async function getTakeoff(organizationId: string, takeoffId: string) {
  const takeoff = await db.takeoff.findFirst({
    where: { id: takeoffId, organizationId },
    include: {
      lines: {
        orderBy: { sortOrder: "asc" },
        include: {
          costCode: { select: { id: true, code: true, name: true } },
          purchasingIntent: true,
          purchaseOrder: { select: { id: true, poNumber: true, status: true } },
        },
      },
      planFiles: {
        orderBy: { createdAt: "desc" },
        include: takeoffPlanFileInclude,
      },
      job: { select: { id: true, name: true, prefix: true } },
    },
  });
  if (!takeoff) throw new TakeoffNotFoundError(takeoffId);
  return takeoff;
}

export async function listTakeoffsForJob(organizationId: string, jobId: string) {
  return db.takeoff.findMany({
    where: { organizationId, jobId },
    orderBy: { createdAt: "desc" },
    include: {
      lines: { select: { id: true, status: true, unitCostCents: true, quantityMilli: true } },
      _count: { select: { planFiles: true } },
    },
  });
}

export class TakeoffFileNotFoundError extends Error {
  constructor(message = "Plan file not found on this job.") {
    super(message);
    this.name = "TakeoffFileNotFoundError";
  }
}

/**
 * Job PLAN files not yet linked to this takeoff — Import from Plans & Specs picker.
 * Reads the same source of truth as Plans & Specs (`listJobPlanFiles`: category PLAN).
 */
export async function listAvailablePlanFilesForTakeoff(organizationId: string, takeoffId: string) {
  const takeoff = await db.takeoff.findFirst({
    where: { id: takeoffId, organizationId },
    select: { id: true, jobId: true },
  });
  if (!takeoff) throw new TakeoffNotFoundError(takeoffId);

  const attached = await db.takeoffFile.findMany({
    where: { takeoffId: takeoff.id },
    select: { fileId: true },
  });
  const attachedIds = new Set(attached.map((row) => row.fileId));

  // Same catalog Plans & Specs shows — sibling migration moves Documents "Plans"
  // folder rows into category PLAN; they appear here automatically.
  const plans = await listJobPlanFiles(organizationId, takeoff.jobId);
  return plans
    .filter((file) => !attachedIds.has(file.id))
    .map((file) => ({
      id: file.id,
      fileName: file.fileName,
      url: file.url,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt,
    }));
}

/** Attach existing job plan File(s) to a takeoff (Plans & Specs import). Idempotent per file. */
export async function attachPlanFilesToTakeoff(input: {
  readonly organizationId: string;
  readonly takeoffId: string;
  readonly fileIds: readonly string[];
}) {
  const takeoff = await db.takeoff.findFirst({
    where: { id: input.takeoffId, organizationId: input.organizationId },
    select: { id: true, jobId: true },
  });
  if (!takeoff) throw new TakeoffNotFoundError(input.takeoffId);

  const uniqueIds = [...new Set(input.fileIds.filter(Boolean))];
  if (uniqueIds.length === 0) throw new TakeoffFileNotFoundError("Choose at least one plan to import.");

  // Only Plans & Specs PLAN files — same catalog as listJobPlanFiles.
  const files = await db.file.findMany({
    where: {
      id: { in: uniqueIds },
      organizationId: input.organizationId,
      jobId: takeoff.jobId,
      category: "PLAN",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (files.length !== uniqueIds.length) {
    throw new TakeoffFileNotFoundError("One or more plans were not found on Plans & Specs for this job.");
  }

  return db.$transaction(async (tx) => {
    const created = [];
    for (const file of files) {
      const row = await tx.takeoffFile.upsert({
        where: { takeoffId_fileId: { takeoffId: takeoff.id, fileId: file.id } },
        create: { takeoffId: takeoff.id, fileId: file.id },
        update: {},
        include: takeoffPlanFileInclude,
      });
      created.push(row);
    }
    return created;
  });
}

export async function detachPlanFileFromTakeoff(input: {
  readonly organizationId: string;
  readonly takeoffId: string;
  readonly fileId: string;
}) {
  const takeoff = await db.takeoff.findFirst({
    where: { id: input.takeoffId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!takeoff) throw new TakeoffNotFoundError(input.takeoffId);

  const link = await db.takeoffFile.findUnique({
    where: { takeoffId_fileId: { takeoffId: takeoff.id, fileId: input.fileId } },
  });
  if (!link) throw new TakeoffFileNotFoundError("That plan is not attached to this takeoff.");

  await db.takeoffFile.delete({ where: { id: link.id } });
}

/** Persist measurement / plan notes on a takeoff (takeoff-lite measurement entry). */
export async function updateTakeoffMeasurements(input: {
  readonly organizationId: string;
  readonly takeoffId: string;
  readonly notes: string;
}) {
  const takeoff = await db.takeoff.findFirst({
    where: { id: input.takeoffId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!takeoff) throw new TakeoffNotFoundError(input.takeoffId);

  const notes = input.notes.trim();
  return db.takeoff.update({
    where: { id: takeoff.id },
    data: { notes: notes.length > 0 ? notes : null },
  });
}

export class TakeoffJobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found.`);
    this.name = "TakeoffJobNotFoundError";
  }
}

/** Create an empty DRAFT takeoff so staff can attach plans / enter measurements first. */
export async function createBlankTakeoff(input: {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title?: string;
  readonly notes?: string | null;
}) {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!job) throw new TakeoffJobNotFoundError(input.jobId);

  const title = (input.title ?? "").trim() || "Untitled takeoff";
  const notes = input.notes?.trim() || null;

  return createTakeoff({
    organizationId: input.organizationId,
    jobId: job.id,
    title,
    notes,
    aiGenerated: false,
    lineItems: [],
  });
}

export interface QueueTakeoffForPurchasingInput {
  readonly organizationId: string;
  readonly takeoffId: string;
  /** When omitted, every DRAFT/READY line is queued. */
  readonly lineIds?: readonly string[];
  readonly vendorHint?: string | null;
  readonly notes?: string | null;
}

/**
 * Explicit "Send to Purchasing" — creates PurchasingIntent rows for Duke.
 * Never runs from AI draft creation.
 */
export async function queueTakeoffForPurchasing(input: QueueTakeoffForPurchasingInput) {
  const takeoff = await db.takeoff.findFirst({
    where: { id: input.takeoffId, organizationId: input.organizationId },
    include: { lines: true },
  });
  if (!takeoff) throw new TakeoffNotFoundError(input.takeoffId);

  const selected = input.lineIds?.length
    ? takeoff.lines.filter((line) => input.lineIds!.includes(line.id))
    : takeoff.lines.filter((line) => line.status === TakeoffLineStatus.DRAFT || line.status === TakeoffLineStatus.READY);

  if (input.lineIds?.length && selected.length !== input.lineIds.length) {
    throw new TakeoffLineNotFoundError();
  }
  if (selected.length === 0) {
    throw new TakeoffLinesNotConvertibleError("No takeoff lines available to queue for purchasing.");
  }

  const blocked = selected.filter(
    (line) =>
      line.status === TakeoffLineStatus.QUEUED ||
      line.status === TakeoffLineStatus.ORDERED ||
      line.status === TakeoffLineStatus.CANCELLED,
  );
  if (blocked.length > 0) {
    throw new TakeoffLinesNotConvertibleError(
      `${blocked.length} line(s) are already queued, ordered, or cancelled and cannot be re-queued.`,
    );
  }

  const intents = await db.$transaction(async (tx) => {
    const created = [];
    for (const line of selected) {
      const intent = await tx.purchasingIntent.create({
        data: {
          organizationId: input.organizationId,
          jobId: takeoff.jobId,
          takeoffId: takeoff.id,
          takeoffLineId: line.id,
          status: PurchasingIntentStatus.QUEUED,
          vendorHint: input.vendorHint ?? null,
          notes: input.notes ?? null,
        },
      });
      await tx.takeoffLine.update({
        where: { id: line.id },
        data: { status: TakeoffLineStatus.QUEUED },
      });
      created.push(intent);
    }

    if (takeoff.status === TakeoffStatus.DRAFT) {
      await tx.takeoff.update({ where: { id: takeoff.id }, data: { status: TakeoffStatus.READY } });
    }
    return created;
  });

  for (const intent of intents) {
    await emitEvent(input.organizationId, "purchasing_intent.queued", {
      purchasingIntentId: intent.id,
      takeoffId: takeoff.id,
      takeoffLineId: intent.takeoffLineId,
      jobId: takeoff.jobId,
    });
  }

  return { takeoffId: takeoff.id, jobId: takeoff.jobId, intents };
}

export interface PushTakeoffToPurchaseOrderInput {
  readonly organizationId: string;
  readonly takeoffId: string;
  readonly poNumber: string;
  readonly vendorName: string;
  readonly vendorId?: string | null;
  readonly lineIds?: readonly string[];
  readonly title?: string | null;
}

/**
 * Explicit "Push to PO" — creates a DRAFT PO tagged sourceType=TAKEOFF.
 * Selected lines (or all not-yet-ordered) become PO line items and are marked ORDERED.
 */
export async function pushTakeoffToPurchaseOrder(input: PushTakeoffToPurchaseOrderInput) {
  const takeoff = await db.takeoff.findFirst({
    where: { id: input.takeoffId, organizationId: input.organizationId },
    include: { lines: true },
  });
  if (!takeoff) throw new TakeoffNotFoundError(input.takeoffId);

  const convertibleStatuses: TakeoffLineStatus[] = [
    TakeoffLineStatus.DRAFT,
    TakeoffLineStatus.READY,
    TakeoffLineStatus.QUEUED,
  ];
  const selected = input.lineIds?.length
    ? takeoff.lines.filter((line) => input.lineIds!.includes(line.id))
    : takeoff.lines.filter((line) => convertibleStatuses.includes(line.status));

  if (input.lineIds?.length && selected.length !== input.lineIds.length) {
    throw new TakeoffLineNotFoundError();
  }
  if (selected.length === 0) {
    throw new TakeoffLinesNotConvertibleError("No takeoff lines available to push to a purchase order.");
  }
  if (selected.some((line) => line.status === TakeoffLineStatus.ORDERED || line.status === TakeoffLineStatus.CANCELLED)) {
    throw new TakeoffLinesNotConvertibleError("Ordered or cancelled lines cannot be pushed to a new purchase order.");
  }

  let purchaseOrder;
  try {
    purchaseOrder = await createPurchaseOrder({
      organizationId: input.organizationId,
      jobId: takeoff.jobId,
      poNumber: input.poNumber,
      vendorName: input.vendorName,
      vendorId: input.vendorId ?? null,
      title: input.title ?? takeoff.title,
      sourceType: FinancialSourceType.TAKEOFF,
      sourceId: takeoff.id,
      lineItems: selected.map((line) => ({
        costCodeId: line.costCodeId,
        costType: line.costType,
        title: line.title,
        quantityMilli: line.quantityMilli,
        unitCostCents: line.unitCostCents,
      })),
    });
  } catch (error) {
    if (error instanceof DuplicatePoNumberError) throw error;
    throw error;
  }

  await db.$transaction(async (tx) => {
    for (const line of selected) {
      await tx.takeoffLine.update({
        where: { id: line.id },
        data: { status: TakeoffLineStatus.ORDERED, purchaseOrderId: purchaseOrder.id },
      });
      await tx.purchasingIntent.updateMany({
        where: {
          takeoffLineId: line.id,
          status: { in: [PurchasingIntentStatus.QUEUED, PurchasingIntentStatus.CLAIMED] },
        },
        data: {
          status: PurchasingIntentStatus.CONVERTED,
          purchaseOrderId: purchaseOrder.id,
        },
      });
    }
    if (takeoff.status === TakeoffStatus.DRAFT) {
      await tx.takeoff.update({ where: { id: takeoff.id }, data: { status: TakeoffStatus.READY } });
    }
  });

  return purchaseOrder;
}

export async function listPurchasingIntents(
  organizationId: string,
  options?: { readonly jobId?: string; readonly status?: PurchasingIntentStatus; readonly limit?: number },
) {
  return db.purchasingIntent.findMany({
    where: {
      organizationId,
      ...(options?.jobId ? { jobId: options.jobId } : {}),
      ...(options?.status ? { status: options.status } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: options?.limit ?? 50,
    include: {
      takeoffLine: {
        include: { costCode: { select: { id: true, code: true, name: true } } },
      },
      takeoff: { select: { id: true, title: true } },
      job: { select: { id: true, name: true, prefix: true } },
      purchaseOrder: { select: { id: true, poNumber: true, status: true } },
    },
  });
}

export async function claimPurchasingIntent(input: {
  readonly organizationId: string;
  readonly intentId: string;
  readonly apiKeyId: string;
}) {
  const intent = await db.purchasingIntent.findFirst({
    where: { id: input.intentId, organizationId: input.organizationId },
  });
  if (!intent) throw new PurchasingIntentNotFoundError(input.intentId);
  if (intent.status !== PurchasingIntentStatus.QUEUED && intent.status !== PurchasingIntentStatus.CLAIMED) {
    throw new PurchasingIntentNotConvertibleError(
      `Purchasing intent is ${intent.status} and cannot be claimed.`,
    );
  }

  return db.purchasingIntent.update({
    where: { id: intent.id },
    data: {
      status: PurchasingIntentStatus.CLAIMED,
      claimedByApiKeyId: input.apiKeyId,
      claimedAt: new Date(),
    },
    include: {
      takeoffLine: true,
      job: { select: { id: true, name: true } },
    },
  });
}

export async function convertPurchasingIntentToPo(input: {
  readonly organizationId: string;
  readonly intentId: string;
  readonly poNumber: string;
  readonly vendorName: string;
  readonly vendorId?: string | null;
  readonly apiKeyId?: string | null;
}) {
  const intent = await db.purchasingIntent.findFirst({
    where: { id: input.intentId, organizationId: input.organizationId },
    include: { takeoffLine: true, takeoff: true },
  });
  if (!intent) throw new PurchasingIntentNotFoundError(input.intentId);
  if (intent.status !== PurchasingIntentStatus.QUEUED && intent.status !== PurchasingIntentStatus.CLAIMED) {
    throw new PurchasingIntentNotConvertibleError(
      `Purchasing intent is ${intent.status} and cannot be converted to a PO.`,
    );
  }

  const line = intent.takeoffLine;
  const purchaseOrder = await createPurchaseOrder({
    organizationId: input.organizationId,
    jobId: intent.jobId,
    poNumber: input.poNumber,
    vendorName: input.vendorName,
    vendorId: input.vendorId ?? null,
    title: line.title,
    sourceType: FinancialSourceType.TAKEOFF,
    sourceId: intent.takeoffId,
    lineItems: [
      {
        costCodeId: line.costCodeId,
        costType: line.costType,
        title: line.title,
        quantityMilli: line.quantityMilli,
        unitCostCents: line.unitCostCents,
      },
    ],
  });

  await db.$transaction(async (tx) => {
    await tx.purchasingIntent.update({
      where: { id: intent.id },
      data: {
        status: PurchasingIntentStatus.CONVERTED,
        purchaseOrderId: purchaseOrder.id,
        ...(input.apiKeyId && intent.status === PurchasingIntentStatus.QUEUED
          ? { claimedByApiKeyId: input.apiKeyId, claimedAt: new Date() }
          : {}),
      },
    });
    await tx.takeoffLine.update({
      where: { id: line.id },
      data: { status: TakeoffLineStatus.ORDERED, purchaseOrderId: purchaseOrder.id },
    });
  });

  await emitEvent(input.organizationId, "purchasing_intent.converted", {
    purchasingIntentId: intent.id,
    purchaseOrderId: purchaseOrder.id,
    takeoffId: intent.takeoffId,
    jobId: intent.jobId,
  });

  return purchaseOrder;
}

/** After uploadAndRegisterFile — link the new PLAN File to the takeoff. */
export async function linkUploadedPlanToTakeoff(input: {
  readonly organizationId: string;
  readonly takeoffId: string;
  readonly fileId: string;
}) {
  return attachPlanFilesToTakeoff({
    organizationId: input.organizationId,
    takeoffId: input.takeoffId,
    fileIds: [input.fileId],
  });
}
