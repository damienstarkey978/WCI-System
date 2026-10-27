/**
 * Persist AI takeoff drafts. Keeps takeoff-assistant free of Prisma.
 */

import { db } from "@/lib/db";
import { draftTakeoffFromNotes } from "@/lib/ai/takeoff-assistant";
import type { CostCodeOption } from "@/lib/ai/takeoff-draft";
import { createTakeoff } from "@/lib/takeoffs/service";

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

export interface CreateAiTakeoffDraftInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly notes: string;
}

export interface CreateAiTakeoffDraftResult {
  readonly takeoffId: string;
  readonly title: string;
  readonly assumptions: readonly string[];
  readonly lineItemCount: number;
}

export async function createAiTakeoffDraft(input: CreateAiTakeoffDraftInput): Promise<CreateAiTakeoffDraftResult> {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, name: true },
  });
  if (!job) throw new JobNotFoundError(input.jobId);

  const costCodeRows = await db.costCode.findMany({
    where: { organizationId: input.organizationId, isActive: true },
    select: { id: true, code: true, name: true, defaultCostType: true },
  });
  if (costCodeRows.length === 0) throw new NoCostCodesError();

  const costCodes: readonly CostCodeOption[] = costCodeRows;
  const defaultCostTypeById = new Map(costCodeRows.map((row) => [row.id, row.defaultCostType]));

  const draft = await draftTakeoffFromNotes({
    jobName: job.name,
    notes: input.notes,
    costCodes,
  });

  const takeoff = await createTakeoff({
    organizationId: input.organizationId,
    jobId: job.id,
    title: draft.title,
    notes: input.notes,
    aiGenerated: true,
    aiPromptNotes: input.notes,
    assumptions: draft.assumptions,
    lineItems: draft.lineItems.map((line) => ({
      costCodeId: line.costCodeId,
      costType: defaultCostTypeById.get(line.costCodeId) ?? "NONE",
      title: line.title,
      description: line.description,
      quantityMilli: line.quantityMilli,
      unit: line.unit,
      unitCostCents: line.unitCostCents,
      groupLabel: line.groupLabel,
      confidence: line.confidence,
    })),
  });

  return {
    takeoffId: takeoff.id,
    title: takeoff.title,
    assumptions: draft.assumptions,
    lineItemCount: takeoff.lines.length,
  };
}
