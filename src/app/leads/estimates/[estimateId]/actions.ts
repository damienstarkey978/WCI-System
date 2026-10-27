"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppUser } from "@/lib/auth";
import {
  createProposalFromLeadEstimate,
  EstimateAlreadyOnProposalError,
  EstimateMissingProposalDraftError,
  EstimateNotOnLeadError,
  LeadMissingContactError,
  LeadNotFoundError,
} from "@/lib/crm/lead-proposal";
import { EstimateNotFoundError } from "@/lib/estimates/service";

export type ActionState = { error?: string };

export async function createProposalFromEstimateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const estimateId = String(formData.get("estimateId") ?? "");
  let proposalId: string;
  let leadId: string | null = null;
  try {
    const proposal = await createProposalFromLeadEstimate({
      organizationId: user.organizationId,
      estimateId,
    });
    proposalId = proposal.id;
    leadId = proposal.leadId;
  } catch (error) {
    if (
      error instanceof EstimateNotFoundError ||
      error instanceof EstimateAlreadyOnProposalError ||
      error instanceof EstimateMissingProposalDraftError ||
      error instanceof EstimateNotOnLeadError ||
      error instanceof LeadMissingContactError ||
      error instanceof LeadNotFoundError
    ) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath(`/leads/estimates/${estimateId}`);
  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/leads/proposals/${proposalId}`);
  redirect(`/leads/proposals/${proposalId}`);
}
