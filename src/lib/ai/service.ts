/**
 * Database wiring for the AI estimate assistant. Keeps src/lib/ai/estimate-assistant.ts
 * free of Prisma so its Claude-calling logic stays unit-testable with a fake client.
 */

import { db } from "@/lib/db";
import { draftEstimateFromNotes } from "@/lib/ai/estimate-assistant";
import type { CostCodeOption } from "@/lib/ai/estimate-draft";

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
}

export interface CreateAiEstimateDraftResult {
  readonly estimateId: string;
  readonly title: string;
  readonly assumptions: readonly string[];
  readonly lineItemCount: number;
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

  const costCodeRows = await db.costCode.findMany({
    where: { organizationId: input.organizationId, isActive: true },
    select: { id: true, code: true, name: true, defaultCostType: true },
  });
  if (costCodeRows.length === 0) {
    throw new NoCostCodesError();
  }
  const costCodes: readonly CostCodeOption[] = costCodeRows;
  const defaultCostTypeById = new Map(costCodeRows.map((row) => [row.id, row.defaultCostType]));

  const draft = await draftEstimateFromNotes({ jobName: job.name, notes: input.notes, costCodes });

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
          quantityMilli: line.quantityMilli,
          unitCostCents: line.unitCostCents,
          rateMode: line.rateMode,
          rateBasisPoints: line.rateBasisPoints,
          internalNote: `AI confidence: ${line.confidence}`,
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
