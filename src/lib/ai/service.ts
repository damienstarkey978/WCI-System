/**
 * Database wiring for the AI estimate assistant. Keeps src/lib/ai/estimate-assistant.ts
 * free of Prisma so its Claude-calling logic stays unit-testable with a fake client.
 */

import { ChangeOrderMode } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { draftEstimateFromNotes, type DraftEstimateImageInput } from "@/lib/ai/estimate-assistant";
import type { CostCodeOption, MaterialCatalogOption } from "@/lib/ai/estimate-draft";
import { createChangeOrder, JobNotFoundError as ChangeOrderJobNotFoundError, JobNotOpenError } from "@/lib/change-orders/service";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class NoCostCodesError extends Error {
  constructor() {
    super("This organization has no active cost codes to draft against. Seed the catalog first.");
    this.name = "NoCostCodesError";
  }
}

export interface CreateAiEstimateDraftInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly notes: string;
  readonly images?: readonly DraftEstimateImageInput[];
}

export interface CreateAiEstimateDraftResult {
  readonly estimateId: string;
  readonly title: string;
  readonly assumptions: readonly string[];
  readonly lineItemCount: number;
}

async function loadDraftingCatalogs(organizationId: string) {
  const costCodeRows = await db.costCode.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, code: true, name: true, defaultCostType: true },
  });
  if (costCodeRows.length === 0) {
    throw new NoCostCodesError();
  }
  const costCodes: readonly CostCodeOption[] = costCodeRows;
  const defaultCostTypeById = new Map(costCodeRows.map((row) => [row.id, row.defaultCostType]));

  const materialRows = await db.materialCatalogItem.findMany({
    where: { organizationId },
    select: { vendor: true, description: true, unit: true, unitCostCents: true },
  });
  const materialCatalog: readonly MaterialCatalogOption[] = materialRows;

  return { costCodes, defaultCostTypeById, materialCatalog };
}

/**
 * Draft an estimate from field notes and persist it.
 *
 * The created estimate is always DRAFT, never locked and never sent to the budget —
 * a human reviews and edits it like any hand-entered estimate before "Send to Job
 * Budget" touches real numbers.
 */
export async function createAiEstimateDraft(input: CreateAiEstimateDraftInput): Promise<CreateAiEstimateDraftResult> {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, name: true },
  });
  if (!job) {
    throw new JobNotFoundError(input.jobId);
  }

  const { costCodes, defaultCostTypeById, materialCatalog } = await loadDraftingCatalogs(input.organizationId);

  const draft = await draftEstimateFromNotes({
    jobName: job.name,
    notes: input.notes,
    costCodes,
    materialCatalog,
    images: input.images,
  });

  // This admin-only tool has no client/lead context to attach a Proposal to, so
  // draft.projectDescription and draft.proposalSections (the client-facing side of
  // the split) are intentionally discarded here — only the Estimate is persisted.
  // The AI-drafted proposal narrative is wired up separately in the Lead Proposal
  // flow (src/lib/crm/lead-proposal.ts), where a real Proposal row can be created.
  const estimate = await db.estimate.create({
    data: {
      organizationId: input.organizationId,
      jobId: job.id,
      title: draft.title,
      aiGenerated: true,
      aiPromptNotes: input.notes,
      lineItems: {
        create: draft.lineItems.map((line, index) => ({
          costCodeId: line.costCodeId,
          costType: defaultCostTypeById.get(line.costCodeId) ?? "NONE",
          title: line.title,
          description: line.description,
          groupLabel: line.groupLabel,
          quantityMilli: line.quantityMilli,
          unitCostCents: line.unitCostCents,
          rateMode: line.rateMode,
          rateBasisPoints: line.rateBasisPoints,
          confidence: line.confidence,
          priceSource: line.priceSource,
          sortOrder: index,
        })),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return {
    estimateId: estimate.id,
    title: estimate.title,
    assumptions: draft.assumptions,
    lineItemCount: estimate.lineItems.length,
  };
}

export interface CreateAiChangeOrderDraftInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly notes: string;
  readonly images?: readonly DraftEstimateImageInput[];
}

export interface CreateAiChangeOrderDraftResult {
  readonly changeOrderId: string;
  readonly title: string;
  readonly assumptions: readonly string[];
  readonly lineItemCount: number;
}

/**
 * Draft an ITEMIZED change order from a description of what changed, reusing the
 * same estimate-drafting pipeline (handoff-ai-analysis-and-jarvis-deep-integration-
 * spec.md Part 3.3b) — a ChangeOrderLineItem and an EstimateLineItem share the same
 * (costCodeId, quantityMilli, unitCostCents, rateMode, rateBasisPoints) shape
 * (src/lib/change-orders/service.ts's own header comment), so the same normalized
 * draft lines map directly onto either. Always created DRAFT — approving it (and so
 * touching the Budget) is still a separate, explicit human action.
 */
export async function createAiChangeOrderDraft(input: CreateAiChangeOrderDraftInput): Promise<CreateAiChangeOrderDraftResult> {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, name: true },
  });
  if (!job) {
    throw new JobNotFoundError(input.jobId);
  }

  const { costCodes, defaultCostTypeById, materialCatalog } = await loadDraftingCatalogs(input.organizationId);

  const draft = await draftEstimateFromNotes({
    jobName: job.name,
    notes: input.notes,
    costCodes,
    materialCatalog,
    images: input.images,
  });

  let changeOrder;
  try {
    changeOrder = await createChangeOrder({
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      mode: ChangeOrderMode.ITEMIZED,
      lineItems: draft.lineItems.map((line) => ({
        costCodeId: line.costCodeId,
        costType: defaultCostTypeById.get(line.costCodeId) ?? "NONE",
        title: line.title,
        quantityMilli: line.quantityMilli,
        unitCostCents: line.unitCostCents,
        rateMode: line.rateMode,
        rateBasisPoints: line.rateBasisPoints,
      })),
    });
  } catch (error) {
    if (error instanceof ChangeOrderJobNotFoundError) throw new JobNotFoundError(input.jobId);
    throw error;
  }

  return {
    changeOrderId: changeOrder.id,
    title: changeOrder.title,
    assumptions: draft.assumptions,
    lineItemCount: draft.lineItems.length,
  };
}

export { JobNotOpenError };
