/** GET /api/v1/proposals/[proposalId]/send-preview — pre-send validation (CR P2 #25). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { getProposalSendPreview, ProposalNotFoundError } from "@/lib/proposals/service";

type Context = { params: Promise<{ proposalId: string }> };

export const GET = withApiAuth<Context>(["proposals:read"], async (_request, auth, context) => {
  const { proposalId } = await context.params;
  try {
    const preview = await getProposalSendPreview(auth.organizationId, proposalId);
    return Response.json({
      data: {
        ready: preview.validation.ready,
        issues: preview.validation.issues,
        displayDate: preview.displayDate,
        taxRateBasisPoints: preview.taxRateBasisPoints,
        title: preview.proposal.title,
        coverMessage: preview.proposal.coverMessage,
        requireSignature: preview.proposal.requireSignature,
        preparedFor: preview.proposal.client,
        draws: preview.proposal.draws,
        sections: preview.proposal.sections,
      },
    });
  } catch (error) {
    if (error instanceof ProposalNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
