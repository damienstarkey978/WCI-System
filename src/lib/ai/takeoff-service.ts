/**
 * Persist AI takeoff drafts. Keeps takeoff-assistant free of Prisma.
 */

import { TakeoffLineStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { draftTakeoffFromNotes } from "@/lib/ai/takeoff-assistant";
import type { CostCodeOption } from "@/lib/ai/takeoff-draft";
import { createTakeoff, TakeoffNotFoundError } from "@/lib/takeoffs/service";

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

export class TakeoffNotEmptyForAiDraftError extends Error {
  constructor() {
    super("This takeoff already has lines. Create a new AI takeoff instead of overwriting.");
    this.name = "TakeoffNotEmptyForAiDraftError";
  }
}

export interface CreateAiTakeoffDraftInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly notes: string;
  /** When set, fills this existing empty takeoff (keeps attached plans) instead of creating a new one. */
  readonly takeoffId?: string;
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

  const lineCreates = draft.lineItems.map((line, index) => ({
    costCodeId: line.costCodeId,
    costType: defaultCostTypeById.get(line.costCodeId) ?? "NONE",
    title: line.title,
    description: line.description,
    quantityMilli: line.quantityMilli,
    unit: line.unit,
    unitCostCents: line.unitCostCents,
    groupLabel: line.groupLabel,
    confidence: line.confidence,
    sortOrder: index,
    status: TakeoffLineStatus.DRAFT,
  }));

  if (input.takeoffId) {
    const existing = await db.takeoff.findFirst({
      where: { id: input.takeoffId, organizationId: input.organizationId, jobId: job.id },
      include: { lines: { select: { id: true } } },
    });
    if (!existing) throw new TakeoffNotFoundError(input.takeoffId);
    if (existing.lines.length > 0) throw new TakeoffNotEmptyForAiDraftError();

    const takeoff = await db.takeoff.update({
      where: { id: existing.id },
      data: {
        title: draft.title || existing.title,
        notes: input.notes,
        aiGenerated: true,
        aiPromptNotes: input.notes,
        assumptions: [...draft.assumptions],
        lines: { create: lineCreates },
      },
      include: { lines: true },
    });

    return {
      takeoffId: takeoff.id,
      title: takeoff.title,
      assumptions: draft.assumptions,
      lineItemCount: takeoff.lines.length,
    };
  }

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
