/**
 * Database wiring for the AI estimate assistant. Keeps src/lib/ai/estimate-assistant.ts
 * free of Prisma so its Claude-calling logic stays unit-testable with a fake client.
 */

import { ChangeOrderMode } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { draftEstimateFromNotes, type DraftEstimateImageInput } from "@/lib/ai/estimate-assistant";
import type { CostCodeOption, MaterialCatalogOption } from "@/lib/ai/estimate-draft";
import { listEnabledAiPreferenceInstructions } from "@/lib/ai/preference-instructions";
import { createChangeOrder, JobNotFoundError as ChangeOrderJobNotFoundError, JobNotOpenError } from "@/lib/change-orders/service";
import { normalizeProposalCoverMessage } from "@/lib/proposals/cover-message";
import { ClientNotFoundError, createProposal } from "@/lib/proposals/service";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead ${leadId} not found`);
    this.name = "LeadNotFoundError";
  }
}

export class NoCostCodesError extends Error {
  constructor() {
    super("This organization has no active cost codes to draft against. Seed the catalog first.");
    this.name = "NoCostCodesError";
  }
}

export class AiDraftTemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Estimate template ${templateId} not found`);
    this.name = "AiDraftTemplateNotFoundError";
  }
}

export { ClientNotFoundError };

export interface CreateAiEstimateDraftInput {
  readonly organizationId: string;
  /** Prefer jobId; leadId alone drafts against a pre-Job lead (CR P2 #26). */
  readonly jobId?: string;
  readonly leadId?: string;
  readonly notes: string;
  readonly images?: readonly DraftEstimateImageInput[];
  /** Markup override in basis points — applied when persisting the DRAFT. */
  readonly defaultRateBasisPoints?: number;
  readonly rateMode?: "MARKUP" | "MARGIN";
  /** Optional EstimateTemplate — its line titles are injected into the AI notes. */
  readonly templateId?: string;
  readonly newVersion?: boolean;
  /**
   * Handy-style notes → estimate lines → proposal: when true, also persist the
   * AI's client-facing narrative (projectDescription + proposalSections) as a
   * DRAFT Proposal linked to this job. Requires a client on the job (or an
   * explicit clientId). Admin/API callers leave this false so they only get the
   * Estimate worksheet.
   */
  readonly createProposal?: boolean;
  /** Prefer this client when createProposal is true; otherwise the first client
   *  with job access is used. */
  readonly clientId?: string;
}

export interface CreateAiEstimateDraftResult {
  readonly estimateId: string;
  readonly title: string;
  readonly assumptions: readonly string[];
  readonly lineItemCount: number;
  readonly proposalId?: string;
  /** Set when createProposal was requested but no client could be resolved. */
  readonly proposalSkippedReason?: string;
}

async function loadDraftingCatalogs(
  organizationId: string,
  options?: { readonly forChangeOrder?: boolean },
) {
  const costCodeRows = await db.costCode.findMany({
    where: { organizationId, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      defaultCostType: true,
      defaultUnit: true,
      defaultUnitCostCents: true,
    },
  });
  if (costCodeRows.length === 0) {
    throw new NoCostCodesError();
  }
  const costCodes: readonly CostCodeOption[] = costCodeRows;
  const defaultCostTypeById = new Map(costCodeRows.map((row) => [row.id, row.defaultCostType]));

  const [materialRows, preferenceInstructions] = await Promise.all([
    db.materialCatalogItem.findMany({
      where: { organizationId },
      select: { vendor: true, description: true, unit: true, unitCostCents: true },
    }),
    listEnabledAiPreferenceInstructions(organizationId, {
      forTypes: options?.forChangeOrder ? ["ESTIMATE", "CHANGE_ORDER"] : ["ESTIMATE", "PROPOSAL"],
      forChangeOrder: options?.forChangeOrder === true,
    }),
  ]);
  const materialCatalog: readonly MaterialCatalogOption[] = materialRows;

  return { costCodes, defaultCostTypeById, materialCatalog, preferenceInstructions };
}

/**
 * Draft an estimate from field notes and persist it.
 *
 * The created estimate is always DRAFT, never locked and never sent to the budget —
 * a human reviews and edits it like any hand-entered estimate before "Send to Job
 * Budget" touches real numbers.
 *
 * When `createProposal` is true (Jarvis Handy path), also creates a DRAFT Proposal
 * with the AI's client-facing narrative — same estimate/proposal split as
 * draftLeadProposalFromNotes (src/lib/crm/lead-proposal.ts), but anchored to an
 * existing Job. Admin/API callers omit that flag and only get the Estimate.
 */
export async function createAiEstimateDraft(input: CreateAiEstimateDraftInput): Promise<CreateAiEstimateDraftResult> {
  if (!input.jobId && !input.leadId) {
    throw new Error("createAiEstimateDraft requires a jobId or a leadId");
  }

  const job = input.jobId
    ? await db.job.findFirst({
        where: { id: input.jobId, organizationId: input.organizationId },
        select: { id: true, name: true, permitWorkType: true },
      })
    : null;
  if (input.jobId && !job) throw new JobNotFoundError(input.jobId);

  const lead = input.leadId
    ? await db.lead.findFirst({
        where: { id: input.leadId, organizationId: input.organizationId },
        select: { id: true, name: true, permitWorkType: true, notes: true },
      })
    : null;
  if (input.leadId && !lead) throw new LeadNotFoundError(input.leadId);

  let templateSeed = "";
  if (input.templateId) {
    const template = await db.estimateTemplate.findFirst({
      where: { id: input.templateId, organizationId: input.organizationId },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) throw new AiDraftTemplateNotFoundError(input.templateId);
    templateSeed = [
      `Start from estimate template "${template.name}":`,
      ...template.lineItems.map((line) => `- ${line.title}`),
    ].join("\n");
  }

  const { costCodes, defaultCostTypeById, materialCatalog, preferenceInstructions } =
    await loadDraftingCatalogs(input.organizationId);

  const scopeName = job?.name ?? lead?.name ?? "Project";
  const permitWorkType = job?.permitWorkType ?? lead?.permitWorkType ?? null;
  const notes = [templateSeed, lead?.notes?.trim(), input.notes].filter(Boolean).join("\n\n");

  const draft = await draftEstimateFromNotes({
    jobName: scopeName,
    notes,
    costCodes,
    materialCatalog,
    images: input.images,
    preferenceInstructions,
    permitWorkType,
  });

  const rateMode = input.rateMode ?? draft.lineItems[0]?.rateMode ?? "MARKUP";
  const defaultRateBasisPoints =
    input.defaultRateBasisPoints ?? draft.lineItems[0]?.rateBasisPoints ?? 4_000;

  const estimate = await db.estimate.create({
    data: {
      organizationId: input.organizationId,
      jobId: job?.id ?? null,
      leadId: lead?.id ?? null,
      title: draft.title,
      aiGenerated: true,
      aiPromptNotes: input.notes,
      permitWorkType,
      rateMode,
      defaultRateBasisPoints,
      lineItems: {
        create: draft.lineItems.map((line, index) => ({
          costCodeId: line.costCodeId,
          costType: defaultCostTypeById.get(line.costCodeId) ?? "NONE",
          title: line.title,
          description: line.description,
          groupLabel: line.groupLabel,
          quantityMilli: line.quantityMilli,
          unit: line.unit,
          unitCostCents: line.unitCostCents,
          rateMode: input.rateMode ?? line.rateMode,
          rateBasisPoints: input.defaultRateBasisPoints ?? line.rateBasisPoints,
          confidence: line.confidence,
          priceSource: line.priceSource,
          sourceNote: line.sourceNote,
          sortOrder: index,
        })),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  const base: CreateAiEstimateDraftResult = {
    estimateId: estimate.id,
    title: estimate.title,
    assumptions: draft.assumptions,
    lineItemCount: estimate.lineItems.length,
  };

  if (!input.createProposal) {
    return base;
  }

  if (!job) {
    return {
      ...base,
      proposalSkippedReason:
        "Lead-only AI drafts leave the proposal for an explicit create-proposal step (pass jobId to auto-create).",
    };
  }

  let clientId = input.clientId ?? null;
  if (clientId) {
    const client = await db.client.findFirst({
      where: { id: clientId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!client) throw new ClientNotFoundError(clientId);
  } else {
    const access = await db.clientJobAccess.findFirst({
      where: { jobId: job.id, client: { organizationId: input.organizationId } },
      orderBy: { createdAt: "asc" },
      select: { clientId: true },
    });
    clientId = access?.clientId ?? null;
  }

  if (!clientId) {
    return {
      ...base,
      proposalSkippedReason:
        "No client is linked to this job yet — the estimate was saved as DRAFT. Link a client (or pass clientId) and ask Jarvis to draft again, or attach this estimate to a proposal with add_proposal_option.",
    };
  }

  const proposal = await createProposal({
    organizationId: input.organizationId,
    jobId: job.id,
    clientId,
    title: draft.title,
    coverMessage: normalizeProposalCoverMessage(draft.projectDescription),
    options: [{ estimateId: estimate.id, label: "Option 1" }],
    sections: draft.proposalSections,
  });

  return { ...base, proposalId: proposal.id };
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

  const { costCodes, defaultCostTypeById, materialCatalog, preferenceInstructions } =
    await loadDraftingCatalogs(input.organizationId, { forChangeOrder: true });

  const draft = await draftEstimateFromNotes({
    jobName: job.name,
    notes: input.notes,
    costCodes,
    materialCatalog,
    images: input.images,
    preferenceInstructions,
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
