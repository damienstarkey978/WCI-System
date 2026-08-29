/**
 * "Lead Proposal" (Buildertrend parity): from the sales rep's point of view,
 * building a proposal straight off a Lead is one action. Under the hood there
 * is no separate pre-Job proposal concept — a Proposal always belongs to a
 * real Job and a real Client (CLAUDE.md 5's "one place computes the numbers":
 * Proposal always prices off a real Estimate on a real Job) — so this
 * orchestrates the same three already-correct, independently-tested actions
 * convertLeadToJob() already exists for (src/lib/crm/service.ts's own
 * "Lead is the only entity that legitimately predates a Job"): convert the
 * lead (idempotent if already converted), find-or-create the Client, then
 * create the Estimate and Proposal on that Job.
 */

import { ContractType } from "@/generated/prisma/enums";
import { AiNotConfiguredError, DraftGenerationError, draftEstimateFromNotes, type DraftEstimateImageInput } from "@/lib/ai/estimate-assistant";
import type { CostCodeOption, MaterialCatalogOption } from "@/lib/ai/estimate-draft";
import { convertLeadToJob, LeadNotFoundError } from "@/lib/crm/service";
import { createEstimate, type CreateEstimateLineItemInput } from "@/lib/estimates/service";
import { db } from "@/lib/db";
import { isSupabaseStorageConfigured } from "@/lib/env";
import { uploadAndRegisterFile } from "@/lib/files/service";
import type { BasisPoints } from "@/lib/money";
import { createProposal, type CreateProposalSectionInput } from "@/lib/proposals/service";
import type { RateMode } from "@/generated/prisma/enums";

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
 * PRESALE_PHOTO) too — by the time this runs, createLeadProposal has already
 * converted the Lead to a Job (idempotently, or it already existed), so there is
 * no separate lead-scoped storage location to later "move": these photos land
 * directly in the job's file library, filed under Pre-Sale Photos, from the
 * start. Best effort: storage may not be configured, and a failed upload never
 * fails the proposal itself, since the draft is the valuable part.
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

  let jobId = lead.convertedJobId;
  if (!jobId) {
    const converted = await convertLeadToJob(input.organizationId, input.leadId, {
      name: lead.name,
      contractType: ContractType.FIXED_PRICE,
    });
    jobId = converted.job.id;
  }

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

  const estimate = await createEstimate({
    organizationId: input.organizationId,
    jobId,
    title: input.title,
    rateMode: input.rateMode,
    defaultRateBasisPoints: input.defaultRateBasisPoints,
    lineItems: input.lineItems,
    aiGenerated: input.aiGenerated,
    aiPromptNotes: input.aiPromptNotes,
  });

  return createProposal({
    organizationId: input.organizationId,
    jobId,
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
 * The Jarvis-style entry point: sales gives Jarvis the scope of work, measurements,
 * and photos for a lead, and it drafts both sides of the estimate/proposal split in
 * one shot (src/lib/ai/estimate-assistant.ts) — then this persists it exactly like a
 * hand-built one via createLeadProposal, so it lands as an ordinary DRAFT proposal a
 * salesperson reviews, edits, and sends. Nothing here is ever auto-sent to a client.
 */
export async function draftLeadProposalFromNotes(input: DraftLeadProposalInput) {
  const lead = await db.lead.findFirst({ where: { id: input.leadId, organizationId: input.organizationId } });
  if (!lead) throw new LeadNotFoundError(input.leadId);

  const [costCodeRows, materialRows] = await Promise.all([
    db.costCode.findMany({
      where: { organizationId: input.organizationId, isActive: true },
      select: { id: true, code: true, name: true, defaultCostType: true },
    }),
    db.materialCatalogItem.findMany({
      where: { organizationId: input.organizationId },
      select: { vendor: true, description: true, unit: true, unitCostCents: true },
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

  const proposal = await createLeadProposal({
    organizationId: input.organizationId,
    leadId: input.leadId,
    title: draft.title,
    coverMessage: draft.projectDescription,
    clientEmail: input.clientEmail,
    clientPhone: input.clientPhone,
    lineItems,
    proposalSections: draft.proposalSections,
    aiGenerated: true,
    aiPromptNotes: input.notes,
  });

  if (input.images?.length) {
    await persistPreSalePhotos({
      organizationId: input.organizationId,
      jobId: proposal.jobId,
      uploadedByUserId: input.userId,
      images: input.images,
    });
  }

  return proposal;
}
