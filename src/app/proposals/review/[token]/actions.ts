"use server";

import { revalidatePath } from "next/cache";

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { InvalidActionTokenError, peekActionToken, redeemActionToken } from "@/lib/client-portal/auth";
import {
  acceptProposal,
  OptionSelectionRequiredError,
  ProposalClientMismatchError,
  ProposalNotFoundError,
  ProposalNotPendingError,
  ProposalOptionNotFoundError,
  submitProposalFeedback,
} from "@/lib/proposals/service";
import { db } from "@/lib/db";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

function handled(error: unknown): string | null {
  if (
    error instanceof InvalidActionTokenError ||
    error instanceof ProposalNotFoundError ||
    error instanceof ProposalNotPendingError ||
    error instanceof OptionSelectionRequiredError ||
    error instanceof ProposalOptionNotFoundError
  ) {
    return error.message;
  }
  if (error instanceof ProposalClientMismatchError) return "This link does not belong to this proposal.";
  return null;
}

/**
 * Resolve which proposal a review-page token is for. Unlike the API routes (which
 * already know the proposalId from their URL path), this page's URL carries only
 * the token, so it peeks the token first to discover the resourceId before doing
 * anything that needs it.
 */
async function resolveProposalForToken(token: string) {
  const { clientId, resourceId: proposalId } = await peekActionToken(token, ClientActionTokenPurpose.PROPOSAL_ACCEPTANCE);
  if (!proposalId) throw new InvalidActionTokenError();

  const proposal = await db.proposal.findUnique({ where: { id: proposalId }, select: { organizationId: true, clientId: true } });
  if (!proposal) throw new ProposalNotFoundError(proposalId);
  if (clientId !== proposal.clientId) throw new ProposalClientMismatchError(proposalId);

  return { proposalId, organizationId: proposal.organizationId };
}

export async function acceptProposalReviewAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const optionId = String(formData.get("optionId") ?? "") || undefined;
  const clientSignatureName = String(formData.get("clientSignatureName") ?? "").trim() || undefined;

  try {
    const { proposalId, organizationId } = await resolveProposalForToken(token);
    await redeemActionToken(token, ClientActionTokenPurpose.PROPOSAL_ACCEPTANCE, proposalId, () =>
      acceptProposal({ organizationId, proposalId, optionId, clientSignatureName }),
    );
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidatePath(`/proposals/review/${token}`);
  return { ok: true };
}

export async function submitFeedbackReviewAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const feedback = String(formData.get("feedback") ?? "").trim();
  if (!feedback) return { error: "Feedback can't be empty." };

  try {
    const { proposalId, organizationId } = await resolveProposalForToken(token);
    await submitProposalFeedback(organizationId, proposalId, feedback);
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidatePath(`/proposals/review/${token}`);
  return { ok: true };
}
