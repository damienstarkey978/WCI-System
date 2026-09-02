/**
 * Estimate creation — extracted from src/app/api/v1/estimates/route.ts (mirroring
 * src/lib/bills/service.ts and src/lib/purchase-orders/service.ts) so a second
 * caller (the staff Estimate page) can create a real Estimate through the exact
 * same validation path instead of a parallel copy of it.
 */

import type { CostType, LineItemConfidence, LineItemPriceSource, RateMode } from "@/generated/prisma/enums";
import { LeadNotFoundError } from "@/lib/crm/service";
import { db } from "@/lib/db";
import type { BasisPoints } from "@/lib/money";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`No job ${jobId} in this organization.`);
    this.name = "JobNotFoundError";
  }
}

export class UnknownCostCodeError extends Error {
  constructor(public readonly unknownIds: readonly string[]) {
    super("One or more cost codes are not in this organization.");
    this.name = "UnknownCostCodeError";
  }
}

export class EstimateNotFoundError extends Error {
  constructor(estimateId: string) {
    super(`Estimate ${estimateId} not found`);
    this.name = "EstimateNotFoundError";
  }
}

export class EstimateLineItemNotFoundError extends Error {
  constructor(lineItemId: string) {
    super(`Estimate line item ${lineItemId} not found`);
    this.name = "EstimateLineItemNotFoundError";
  }
}

/** An estimate stops being editable the moment it's sent to budget, locked, or accepted. */
export class EstimateNotEditableError extends Error {
  constructor(estimateId: string, status: string) {
    super(`Estimate ${estimateId} is ${status} and can no longer be edited.`);
    this.name = "EstimateNotEditableError";
  }
}

export interface CreateEstimateLineItemInput {
  readonly costCodeId: string;
  readonly costType?: CostType;
  readonly title: string;
  readonly description?: string | null;
  readonly quantityMilli?: number;
  readonly unitCostCents: number;
  readonly rateMode?: RateMode;
  readonly rateBasisPoints?: BasisPoints;
  readonly taxable?: boolean;
  readonly internalNote?: string | null;
  readonly groupLabel?: string | null;
  /** Set only by the AI estimate assistant — null for hand-entered lines. */
  readonly confidence?: LineItemConfidence | null;
  /** Set only by the AI estimate assistant — null for hand-entered lines. */
  readonly priceSource?: LineItemPriceSource | null;
}

export interface CreateEstimateInput {
  readonly organizationId: string;
  /** Omit for an estimate drafted straight off a Lead, before any Job exists —
   *  leadId is required in that case. Set for an estimate against a real Job. */
  readonly jobId?: string;
  readonly leadId?: string;
  readonly title: string;
  readonly rateMode?: RateMode;
  readonly defaultRateBasisPoints?: BasisPoints;
  readonly lineItems: readonly CreateEstimateLineItemInput[];
  readonly aiGenerated?: boolean;
  readonly aiPromptNotes?: string | null;
}

export async function createEstimate(input: CreateEstimateInput) {
  if (!input.jobId && !input.leadId) throw new Error("createEstimate requires a jobId or a leadId");

  if (input.jobId) {
    const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } });
    if (!job) throw new JobNotFoundError(input.jobId);
  }
  if (input.leadId) {
    const lead = await db.lead.findFirst({ where: { id: input.leadId, organizationId: input.organizationId }, select: { id: true } });
    if (!lead) throw new LeadNotFoundError(input.leadId);
  }

  const rateMode = input.rateMode ?? "MARKUP";
  const defaultRateBasisPoints = input.defaultRateBasisPoints ?? 0;

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

  return db.estimate.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId ?? null,
      leadId: input.leadId ?? null,
      title: input.title,
      rateMode,
      defaultRateBasisPoints,
      aiGenerated: input.aiGenerated ?? false,
      aiPromptNotes: input.aiPromptNotes ?? null,
      lineItems: {
        create: input.lineItems.map((item, index) => ({
          costCodeId: item.costCodeId,
          costType: item.costType ?? defaultCostTypeById.get(item.costCodeId) ?? "NONE",
          title: item.title,
          description: item.description ?? null,
          quantityMilli: item.quantityMilli ?? 1_000,
          unitCostCents: item.unitCostCents,
          rateMode: item.rateMode ?? rateMode,
          rateBasisPoints: item.rateBasisPoints ?? defaultRateBasisPoints,
          taxable: item.taxable ?? false,
          internalNote: item.internalNote ?? null,
          groupLabel: item.groupLabel ?? null,
          confidence: item.confidence ?? null,
          priceSource: item.priceSource ?? null,
          sortOrder: index,
        })),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}

async function requireEditableEstimate(organizationId: string, estimateId: string) {
  const estimate = await db.estimate.findFirst({ where: { id: estimateId, organizationId } });
  if (!estimate) throw new EstimateNotFoundError(estimateId);
  if (estimate.status !== "DRAFT") throw new EstimateNotEditableError(estimateId, estimate.status);
  return estimate;
}

export interface AddEstimateLineItemInput extends CreateEstimateLineItemInput {
  readonly organizationId: string;
  readonly estimateId: string;
}

export async function addEstimateLineItem(input: AddEstimateLineItemInput) {
  const estimate = await requireEditableEstimate(input.organizationId, input.estimateId);

  const costCode = await db.costCode.findFirst({
    where: { id: input.costCodeId, organizationId: input.organizationId },
    select: { id: true, defaultCostType: true },
  });
  if (!costCode) throw new UnknownCostCodeError([input.costCodeId]);

  const last = await db.estimateLineItem.findFirst({ where: { estimateId: input.estimateId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });

  return db.estimateLineItem.create({
    data: {
      estimateId: input.estimateId,
      costCodeId: input.costCodeId,
      costType: input.costType ?? costCode.defaultCostType,
      title: input.title,
      description: input.description ?? null,
      quantityMilli: input.quantityMilli ?? 1_000,
      unitCostCents: input.unitCostCents,
      rateMode: input.rateMode ?? estimate.rateMode,
      rateBasisPoints: input.rateBasisPoints ?? estimate.defaultRateBasisPoints,
      taxable: input.taxable ?? false,
      internalNote: input.internalNote ?? null,
      groupLabel: input.groupLabel ?? null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
}

export interface UpdateEstimateLineItemInput {
  readonly organizationId: string;
  readonly estimateId: string;
  readonly lineItemId: string;
  readonly title?: string;
  readonly description?: string | null;
  readonly quantityMilli?: number;
  readonly unitCostCents?: number;
  readonly rateBasisPoints?: BasisPoints;
  readonly groupLabel?: string | null;
}

export async function updateEstimateLineItem(input: UpdateEstimateLineItemInput) {
  await requireEditableEstimate(input.organizationId, input.estimateId);

  const lineItem = await db.estimateLineItem.findFirst({ where: { id: input.lineItemId, estimateId: input.estimateId } });
  if (!lineItem) throw new EstimateLineItemNotFoundError(input.lineItemId);

  return db.estimateLineItem.update({
    where: { id: lineItem.id },
    data: {
      title: input.title ?? lineItem.title,
      description: input.description === undefined ? lineItem.description : input.description,
      quantityMilli: input.quantityMilli ?? lineItem.quantityMilli,
      unitCostCents: input.unitCostCents ?? lineItem.unitCostCents,
      rateBasisPoints: input.rateBasisPoints ?? lineItem.rateBasisPoints,
      groupLabel: input.groupLabel === undefined ? lineItem.groupLabel : input.groupLabel,
    },
  });
}

export async function deleteEstimateLineItem(organizationId: string, estimateId: string, lineItemId: string) {
  await requireEditableEstimate(organizationId, estimateId);

  const lineItem = await db.estimateLineItem.findFirst({ where: { id: lineItemId, estimateId }, select: { id: true } });
  if (!lineItem) return;
  await db.estimateLineItem.delete({ where: { id: lineItem.id } });
}
