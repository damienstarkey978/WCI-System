/** /api/v1/proposals/[proposalId]/send — mark a proposal SENT. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  IncompletePreparedForError,
  IncompleteProposalTermsError,
  PaymentScheduleIncompleteError,
  ProposalNotDraftError,
  ProposalNotFoundError,
  sendProposal,
  SignatureRequiredError,
} from "@/lib/proposals/service";
import { BannedCoverMessageError } from "@/lib/proposals/cover-message";

type Context = { params: Promise<{ proposalId: string }> };

export const POST = withApiAuth<Context>(["proposals:write"], async (_request, auth, context) => {
  const { proposalId } = await context.params;

  try {
    const proposal = await sendProposal(auth.organizationId, proposalId);
    return Response.json({ data: proposal });
  } catch (error) {
    if (error instanceof ProposalNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof ProposalNotDraftError) return apiError(409, "not_draft", error.message);
    if (error instanceof SignatureRequiredError) {
      return apiError(422, "signature_required", error.message);
    }
    if (error instanceof IncompleteProposalTermsError) {
      return apiError(422, "incomplete_terms", error.message, { reasons: error.reasons });
    }
    if (error instanceof PaymentScheduleIncompleteError) {
      return apiError(422, "incomplete_payment_schedule", error.message, { reasons: error.reasons });
    }
    if (error instanceof BannedCoverMessageError) {
      return apiError(422, "banned_cover_message", error.message);
    }
    if (error instanceof IncompletePreparedForError) {
      return apiError(422, "incomplete_prepared_for", error.message, { reasons: error.reasons });
    }
    throw error;
  }
});
