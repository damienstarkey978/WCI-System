/**
 * Estimate creation — extracted from src/app/api/v1/estimates/route.ts (mirroring
 * src/lib/bills/service.ts and src/lib/purchase-orders/service.ts) so a second
 * caller (the staff Estimate page) can create a real Estimate through the exact
 * same validation path instead of a parallel copy of it.
 */

import { Prisma } from "@/generated/prisma/client";
import type { CostType, LineItemConfidence, LineItemPriceSource, RateMode } from "@/generated/prisma/enums";
import { LeadNotFoundError } from "@/lib/crm/service";
import { db } from "@/lib/db";
import {
  assertNoHourlyLaborForPerUnitTrade,
  HourlyLaborNotAllowedError,
} from "@/lib/estimates/no-hourly";
import {
  LOCKED_ORG_ESTIMATE_RATE_DEFAULTS,
  resolveLineRate,
  type OrgEstimateRateDefaults,
} from "@/lib/estimates/org-defaults";
import { normalizeEstimateUnit, UnknownEstimateUnitError } from "@/lib/estimates/units";
import type { BasisPoints } from "@/lib/money";

export { HourlyLaborNotAllowedError, UnknownEstimateUnitError };

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
  /** Unit of measure (hr, ea, sf, …). Optional — UI falls back by cost type. */
  readonly unit?: string | null;
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
  /** Client narrative held until explicit Create Proposal (lead Jarvis path). */
  readonly pendingProposalDraft?: unknown | null;
}

async function loadOrgEstimateRateDefaults(organizationId: string): Promise<OrgEstimateRateDefaults> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      defaultEstimateRateMode: true,
      defaultEstimateRateBasisPoints: true,
      allowPerLineRateOverride: true,
    },
  });
  if (!org) return LOCKED_ORG_ESTIMATE_RATE_DEFAULTS;
  return {
    rateMode: org.defaultEstimateRateMode,
    defaultRateBasisPoints: org.defaultEstimateRateBasisPoints,
    allowPerLineRateOverride: org.allowPerLineRateOverride,
  };
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

  const orgRates = await loadOrgEstimateRateDefaults(input.organizationId);
  const headerRate = resolveLineRate({
    org: orgRates,
    rateMode: input.rateMode,
    rateBasisPoints: input.defaultRateBasisPoints,
  });
  // AI drafts always lock to org default even if a caller forgot to pass rates.
  const rateMode = input.aiGenerated ? orgRates.rateMode : headerRate.rateMode;
  const defaultRateBasisPoints = input.aiGenerated
    ? orgRates.defaultRateBasisPoints
    : headerRate.rateBasisPoints;

  const costCodeIds = [...new Set(input.lineItems.map((item) => item.costCodeId))];
  const known = await db.costCode.findMany({
    where: { id: { in: costCodeIds }, organizationId: input.organizationId },
    select: { id: true, defaultCostType: true, code: true, name: true },
  });
  if (known.length !== costCodeIds.length) {
    const knownIds = new Set(known.map((code) => code.id));
    throw new UnknownCostCodeError(costCodeIds.filter((id) => !knownIds.has(id)));
  }
  const costCodeById = new Map(known.map((code) => [code.id, code]));

  const preparedLines = input.lineItems.map((item, index) => {
    const costCode = costCodeById.get(item.costCodeId)!;
    const costType = item.costType ?? costCode.defaultCostType;
    const unit = normalizeEstimateUnit(item.unit);
    assertNoHourlyLaborForPerUnitTrade({
      costType,
      unit,
      title: item.title,
      description: item.description,
      groupLabel: item.groupLabel,
      costCodeCode: costCode.code,
      costCodeName: costCode.name,
    });
    const lineRate = resolveLineRate({
      org: input.aiGenerated
        ? { ...orgRates, allowPerLineRateOverride: false }
        : orgRates,
      rateMode: item.rateMode ?? rateMode,
      rateBasisPoints: item.rateBasisPoints ?? defaultRateBasisPoints,
    });
    return {
      costCodeId: item.costCodeId,
      costType,
      title: item.title,
      description: item.description ?? null,
      quantityMilli: item.quantityMilli ?? 1_000,
      unit,
      unitCostCents: item.unitCostCents,
      rateMode: lineRate.rateMode,
      rateBasisPoints: lineRate.rateBasisPoints,
      taxable: item.taxable ?? false,
      internalNote: item.internalNote ?? null,
      groupLabel: item.groupLabel ?? null,
      confidence: item.confidence ?? null,
      priceSource: item.priceSource ?? null,
      sortOrder: index,
    };
  });

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
      pendingProposalDraft:
        input.pendingProposalDraft === undefined
          ? undefined
          : input.pendingProposalDraft === null
            ? Prisma.DbNull
            : (input.pendingProposalDraft as Prisma.InputJsonValue),
      lineItems: {
        create: preparedLines,
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

export class EstimateNotLockedError extends Error {
  constructor(estimateId: string, status: string) {
    super(`Estimate ${estimateId} is ${status}, only a locked estimate can be unlocked for revision.`);
    this.name = "EstimateNotLockedError";
  }
}

/**
 * Reopens a locked estimate for editing as a new revision. The budget it already wrote
 * is untouched until the revised estimate is sent again (sendEstimateToBudget with
 * allowResend), which updates revised figures and never the original baseline.
 */
export async function unlockEstimateForRevision(organizationId: string, estimateId: string) {
  const estimate = await db.estimate.findFirst({ where: { id: estimateId, organizationId } });
  if (!estimate) throw new EstimateNotFoundError(estimateId);
  if (estimate.status !== "LOCKED") throw new EstimateNotLockedError(estimateId, estimate.status);

  return db.estimate.update({
    where: { id: estimate.id },
    data: { status: "DRAFT", lockedAt: null, version: { increment: 1 } },
  });
}

export interface AddEstimateLineItemInput extends CreateEstimateLineItemInput {
  readonly organizationId: string;
  readonly estimateId: string;
}

export async function addEstimateLineItem(input: AddEstimateLineItemInput) {
  const estimate = await requireEditableEstimate(input.organizationId, input.estimateId);
  const orgRates = await loadOrgEstimateRateDefaults(input.organizationId);

  const costCode = await db.costCode.findFirst({
    where: { id: input.costCodeId, organizationId: input.organizationId },
    select: { id: true, defaultCostType: true, code: true, name: true },
  });
  if (!costCode) throw new UnknownCostCodeError([input.costCodeId]);

  const costType = input.costType ?? costCode.defaultCostType;
  const unit = normalizeEstimateUnit(input.unit);
  assertNoHourlyLaborForPerUnitTrade({
    costType,
    unit,
    title: input.title,
    description: input.description,
    groupLabel: input.groupLabel,
    costCodeCode: costCode.code,
    costCodeName: costCode.name,
  });
  const lineRate = resolveLineRate({
    org: orgRates,
    rateMode: input.rateMode ?? estimate.rateMode,
    rateBasisPoints: input.rateBasisPoints ?? estimate.defaultRateBasisPoints,
  });

  const last = await db.estimateLineItem.findFirst({ where: { estimateId: input.estimateId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });

  return db.estimateLineItem.create({
    data: {
      estimateId: input.estimateId,
      costCodeId: input.costCodeId,
      costType,
      title: input.title,
      description: input.description ?? null,
      quantityMilli: input.quantityMilli ?? 1_000,
      unit,
      unitCostCents: input.unitCostCents,
      rateMode: lineRate.rateMode,
      rateBasisPoints: lineRate.rateBasisPoints,
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
  readonly unit?: string | null;
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
      unit: input.unit === undefined ? lineItem.unit : input.unit?.trim() || null,
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

/**
 * Persist a new line-item order (Handoff drag handles). `orderedIds` must be the
 * full set of line item ids for the estimate; sortOrder becomes the array index.
 */
export async function reorderEstimateLineItems(
  organizationId: string,
  estimateId: string,
  orderedIds: readonly string[],
) {
  await requireEditableEstimate(organizationId, estimateId);

  const existing = await db.estimateLineItem.findMany({
    where: { estimateId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((row) => row.id));
  if (orderedIds.length !== existing.length || orderedIds.some((id) => !existingIds.has(id))) {
    throw new Error("Reorder list must include every line item on the estimate exactly once.");
  }

  await db.$transaction(
    orderedIds.map((id, index) =>
      db.estimateLineItem.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
}
