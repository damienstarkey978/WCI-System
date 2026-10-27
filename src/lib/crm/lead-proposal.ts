/**
 * "Lead Proposal" (Buildertrend parity): from the sales rep's point of view,
 * building a proposal straight off a Lead is one action. There is no Job to
 * belong to until a client actually accepts the proposal (CLAUDE.md 3:
 * "converts to a Job on acceptance" — see acceptProposal() in
 * src/lib/proposals/service.ts, which creates the real Job at that moment) —
 * so this finds-or-creates the Client, then creates the Estimate and Proposal
 * scoped to the Lead itself (or to its Job already, if an earlier proposal on
 * this same lead already got accepted).
 */

import { AiNotConfiguredError, DraftGenerationError, draftEstimateFromNotes, type DraftEstimateImageInput } from "@/lib/ai/estimate-assistant";
import type { CostCodeOption, MaterialCatalogOption } from "@/lib/ai/estimate-draft";
import { listEnabledAiPreferenceInstructions } from "@/lib/ai/preference-instructions";
import { LeadNotFoundError } from "@/lib/crm/service";
import { Prisma } from "@/generated/prisma/client";
import type { RateMode } from "@/generated/prisma/enums";
import { parsePendingProposalDraft } from "@/lib/crm/pending-proposal-draft";
import { createEstimate, EstimateNotFoundError, type CreateEstimateLineItemInput } from "@/lib/estimates/service";
import { db } from "@/lib/db";
import { isSupabaseStorageConfigured } from "@/lib/env";
import { uploadAndRegisterFile } from "@/lib/files/service";
import type { BasisPoints } from "@/lib/money";
import { createProposal, type CreateProposalSectionInput } from "@/lib/proposals/service";

const IMAGE_EXTENSION_BY_MEDIA_TYPE: Record<DraftEstimateImageInput["mediaType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * The photos a salesperson attaches to the "Draft with Jarvis" form are sent to
 * Claude as vision input for the estimate draft, then would otherwise be thrown
 * away. Persist them into the job's own Pre-Sale Photos folder (FileCategory.
 * PRESALE_PHOTO) too — only called when the lead already has a real Job (an
 * earlier proposal on it was already accepted); a still-jobless lead has
 * nowhere to file them yet, so the caller skips this entirely in that case.
 * Best effort: storage may not be configured, and a failed upload never fails
 * the proposal itself, since the draft is the valuable part.
 */
async function persistPreSalePhotos(params: {
  organizationId: string;
  jobId: string;
  uploadedByUserId: string;
  images: readonly DraftEstimateImageInput[];
}): Promise<void> {
  if (params.images.length === 0 || !isSupabaseStorageConfigured()) return;

  await Promise.all(
    params.images.map(async (image, index) => {
      try {
        await uploadAndRegisterFile({
          organizationId: params.organizationId,
          jobId: params.jobId,
          uploadedByUserId: params.uploadedByUserId,
          fileName: `presale-photo-${index + 1}.${IMAGE_EXTENSION_BY_MEDIA_TYPE[image.mediaType]}`,
          bytes: Buffer.from(image.base64Data, "base64"),
          mimeType: image.mediaType,
          category: "PRESALE_PHOTO",
        });
      } catch {
        // Best effort — the AI-drafted estimate/proposal is already saved; a photo
        // upload failure shouldn't take that down with it.
      }
    }),
  );
}

export { LeadNotFoundError, AiNotConfiguredError, DraftGenerationError };

export class NoCostCodesError extends Error {
  constructor() {
    super("This organization has no active cost codes to draft against. Seed the catalog first.");
    this.name = "NoCostCodesError";
  }
}

export class LeadMissingContactError extends Error {
  constructor(leadId: string) {
    super(`Lead ${leadId} needs a contact email before a proposal can be created — none was provided.`);
    this.name = "LeadMissingContactError";
  }
}

export interface CreateLeadProposalInput {
  readonly organizationId: string;
  readonly leadId: string;
  readonly title: string;
  readonly coverMessage?: string | null;
  /** Falls back to the lead's own email/phone when omitted. */
  readonly clientEmail?: string | null;
  readonly clientPhone?: string | null;
  readonly rateMode?: RateMode;
  readonly defaultRateBasisPoints?: BasisPoints;
  readonly lineItems: readonly CreateEstimateLineItemInput[];
  readonly proposalSections?: readonly CreateProposalSectionInput[];
  readonly aiGenerated?: boolean;
  readonly aiPromptNotes?: string | null;
}

export async function createLeadProposal(input: CreateLeadProposalInput) {
  const lead = await db.lead.findFirst({ where: { id: input.leadId, organizationId: input.organizationId } });
  if (!lead) throw new LeadNotFoundError(input.leadId);

  const clientEmail = input.clientEmail ?? lead.email;
  if (!clientEmail) throw new LeadMissingContactError(input.leadId);

  // Null until a proposal for this lead is actually accepted (acceptProposal()
  // creates the real Job at that moment, CLAUDE.md 3's "converts to a Job on
  // acceptance") — unless this lead already has one, from an earlier accepted
  // proposal (e.g. this is a follow-up/revised proposal against that same job).
  const jobId = lead.convertedJobId;

  const client = await db.client.upsert({
    where: { organizationId_email: { organizationId: input.organizationId, email: clientEmail } },
    create: {
      organizationId: input.organizationId,
      name: lead.name,
      email: clientEmail,
      phone: input.clientPhone ?? lead.phone,
    },
    update: {},
  });

  // No Job yet means no portal to grant access to yet either — acceptProposal()
  // creates this same grant once the Job actually exists.
  if (jobId) {
    await db.clientJobAccess.upsert({
      where: { clientId_jobId: { clientId: client.id, jobId } },
      create: {
        clientId: client.id,
        jobId,
        canViewDailyLogs: true,
        canViewSchedule: true,
        canViewDocuments: true,
        canViewBudget: true,
        canViewInvoices: true,
        canMakePayments: true,
        canViewBills: false,
        canViewSelections: true,
        canApproveSelections: true,
        canViewChangeOrders: true,
        canApproveChangeOrders: true,
      },
      update: {},
    });
  }

  const estimate = await createEstimate({
    organizationId: input.organizationId,
    jobId: jobId ?? undefined,
    leadId: jobId ? undefined : lead.id,
    title: input.title,
    rateMode: input.rateMode,
    defaultRateBasisPoints: input.defaultRateBasisPoints,
    lineItems: input.lineItems,
    aiGenerated: input.aiGenerated,
    aiPromptNotes: input.aiPromptNotes,
  });

  return createProposal({
    organizationId: input.organizationId,
    jobId: jobId ?? undefined,
    leadId: input.leadId,
    clientId: client.id,
    title: input.title,
    coverMessage: input.coverMessage,
    options: [{ estimateId: estimate.id, label: "Option 1" }],
    sections: input.proposalSections,
  });
}

export interface DraftLeadProposalInput {
  readonly organizationId: string;
  readonly leadId: string;
  readonly userId: string;
  readonly notes: string;
  readonly images?: readonly DraftEstimateImageInput[];
  readonly clientEmail?: string | null;
  readonly clientPhone?: string | null;
}

/**
 * Handoff-style Jarvis entry: draft a real Estimate (line items + cost codes) first.
 * Client narrative is held on Estimate.pendingProposalDraft until an explicit
 * createProposalFromLeadEstimate() conversion — never auto-sent.
 */
export async function draftLeadProposalFromNotes(input: DraftLeadProposalInput) {
  const lead = await db.lead.findFirst({ where: { id: input.leadId, organizationId: input.organizationId } });
  if (!lead) throw new LeadNotFoundError(input.leadId);

  const [costCodeRows, materialRows, preferenceInstructions] = await Promise.all([
    db.costCode.findMany({
      where: { organizationId: input.organizationId, isActive: true },
      select: { id: true, code: true, name: true, defaultCostType: true },
    }),
    db.materialCatalogItem.findMany({
      where: { organizationId: input.organizationId },
      select: { vendor: true, description: true, unit: true, unitCostCents: true },
    }),
    listEnabledAiPreferenceInstructions(input.organizationId, {
      forTypes: ["ESTIMATE", "PROPOSAL"],
    }),
  ]);
  if (costCodeRows.length === 0) throw new NoCostCodesError();

  const costCodes: readonly CostCodeOption[] = costCodeRows;
  const materialCatalog: readonly MaterialCatalogOption[] = materialRows;

  const draft = await draftEstimateFromNotes({
    jobName: lead.name,
    notes: input.notes,
    costCodes,
    materialCatalog,
    images: input.images,
    preferenceInstructions,
  });

  const lineItems: readonly CreateEstimateLineItemInput[] = draft.lineItems.map((line) => ({
    costCodeId: line.costCodeId,
    title: line.title,
    description: line.description,
    quantityMilli: line.quantityMilli,
    unitCostCents: line.unitCostCents,
    rateMode: line.rateMode,
    rateBasisPoints: line.rateBasisPoints,
    confidence: line.confidence,
    priceSource: line.priceSource,
    groupLabel: line.groupLabel,
  }));

  const jobId = lead.convertedJobId;

  const estimate = await createEstimate({
    organizationId: input.organizationId,
    jobId: jobId ?? undefined,
    // Always keep the lead link so Create Proposal can find the CRM record even
    // when this lead already converted and the estimate is also job-scoped.
    leadId: lead.id,
    title: draft.title,
    lineItems,
    aiGenerated: true,
    aiPromptNotes: input.notes,
    pendingProposalDraft: {
      coverMessage: draft.projectDescription,
      sections: draft.proposalSections.map((section) => ({
        title: section.title,
        bullets: [...section.bullets],
      })),
    },
  });

  // Only once there's a real Job to file them into (this lead already had an
  // earlier proposal accepted). A still-jobless lead has nowhere to file photos yet.
  if (input.images?.length && jobId) {
    await persistPreSalePhotos({
      organizationId: input.organizationId,
      jobId,
      uploadedByUserId: input.userId,
      images: input.images,
    });
  }

  return estimate;
}

export class EstimateAlreadyOnProposalError extends Error {
  constructor(estimateId: string, proposalId: string) {
    super(`Estimate ${estimateId} is already linked to proposal ${proposalId}.`);
    this.name = "EstimateAlreadyOnProposalError";
  }
}

export class EstimateMissingProposalDraftError extends Error {
  constructor(estimateId: string) {
    super(`Estimate ${estimateId} has no pending client narrative to convert. Re-draft with Jarvis, or create a proposal manually.`);
    this.name = "EstimateMissingProposalDraftError";
  }
}

export class EstimateNotOnLeadError extends Error {
  constructor(estimateId: string) {
    super(`Estimate ${estimateId} is not attached to a lead, so it cannot use the lead Create Proposal path.`);
    this.name = "EstimateNotOnLeadError";
  }
}

function deriveSectionsFromLineItems(
  lineItems: readonly { groupLabel: string | null; title: string; description: string | null }[],
): CreateProposalSectionInput[] {
  const groups = new Map<string, string[]>();
  for (const item of lineItems) {
    const key = item.groupLabel?.trim() || "Scope of work";
    const bullet = item.description?.trim() || item.title;
    const existing = groups.get(key);
    if (existing) existing.push(bullet);
    else groups.set(key, [bullet]);
  }
  return [...groups.entries()].map(([title, bullets]) => ({ title, bullets }));
}

/**
 * Explicit Estimate → Proposal conversion (Handoff / send-to-budget pattern).
 * Creates a DRAFT proposal linked to this estimate via ProposalOption and clears
 * pendingProposalDraft so the conversion is one-shot.
 */
export async function createProposalFromLeadEstimate(input: {
  readonly organizationId: string;
  readonly estimateId: string;
  readonly clientEmail?: string | null;
  readonly clientPhone?: string | null;
}) {
  const estimate = await db.estimate.findFirst({
    where: { id: input.estimateId, organizationId: input.organizationId },
    include: {
      proposalOptions: { select: { proposalId: true }, take: 1 },
      lineItems: { orderBy: { sortOrder: "asc" }, select: { groupLabel: true, title: true, description: true } },
    },
  });
  if (!estimate) throw new EstimateNotFoundError(input.estimateId);
  if (estimate.proposalOptions[0]) {
    throw new EstimateAlreadyOnProposalError(estimate.id, estimate.proposalOptions[0].proposalId);
  }

  let lead = estimate.leadId
    ? await db.lead.findFirst({ where: { id: estimate.leadId, organizationId: input.organizationId } })
    : null;
  if (estimate.leadId && !lead) throw new LeadNotFoundError(estimate.leadId);
  if (!lead && estimate.jobId) {
    lead = await db.lead.findFirst({
      where: { organizationId: input.organizationId, convertedJobId: estimate.jobId },
    });
  }
  if (!lead) throw new EstimateNotOnLeadError(estimate.id);

  const pending = parsePendingProposalDraft(estimate.pendingProposalDraft);
  const sections = pending
    ? pending.sections.map((section) => ({ title: section.title, bullets: [...section.bullets] }))
    : deriveSectionsFromLineItems(estimate.lineItems);
  if (sections.length === 0) throw new EstimateMissingProposalDraftError(estimate.id);

  const clientEmail = input.clientEmail ?? lead.email;
  if (!clientEmail) throw new LeadMissingContactError(lead.id);

  const jobId = lead.convertedJobId ?? estimate.jobId ?? null;

  const client = await db.client.upsert({
    where: { organizationId_email: { organizationId: input.organizationId, email: clientEmail } },
    create: {
      organizationId: input.organizationId,
      name: lead.name,
      email: clientEmail,
      phone: input.clientPhone ?? lead.phone,
    },
    update: {},
  });

  if (jobId) {
    await db.clientJobAccess.upsert({
      where: { clientId_jobId: { clientId: client.id, jobId } },
      create: {
        clientId: client.id,
        jobId,
        canViewDailyLogs: true,
        canViewSchedule: true,
        canViewDocuments: true,
        canViewBudget: true,
        canViewInvoices: true,
        canMakePayments: true,
        canViewBills: false,
        canViewSelections: true,
        canApproveSelections: true,
        canViewChangeOrders: true,
        canApproveChangeOrders: true,
      },
      update: {},
    });
  }

  const proposal = await createProposal({
    organizationId: input.organizationId,
    jobId: jobId ?? undefined,
    leadId: lead.id,
    clientId: client.id,
    title: estimate.title,
    coverMessage: pending?.coverMessage ?? null,
    options: [{ estimateId: estimate.id, label: "Option 1" }],
    sections,
  });

  await db.estimate.update({
    where: { id: estimate.id },
    data: { pendingProposalDraft: Prisma.DbNull },
  });

  return proposal;
}
