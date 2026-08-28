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
import { convertLeadToJob, LeadNotFoundError } from "@/lib/crm/service";
import { createEstimate, type CreateEstimateLineItemInput } from "@/lib/estimates/service";
import { db } from "@/lib/db";
import type { BasisPoints } from "@/lib/money";
import { createProposal } from "@/lib/proposals/service";
import type { RateMode } from "@/generated/prisma/enums";

export { LeadNotFoundError };

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
  });

  return createProposal({
    organizationId: input.organizationId,
    jobId,
    leadId: input.leadId,
    estimateId: estimate.id,
    clientId: client.id,
    title: input.title,
    coverMessage: input.coverMessage,
  });
}
