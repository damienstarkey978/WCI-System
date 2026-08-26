/** /api/v1/proposals/[proposalId]/decline — staff-recorded decline (e.g. a verbal "no"). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { declineProposal, ProposalNotFoundError, ProposalNotPendingError } from "@/lib/proposals/service";

type Context = { params: Promise<{ proposalId: string }> };

export const POST = withApiAuth<Context>(["proposals:write"], async (_request, auth, context) => {
  const { proposalId } = await context.params;

  try {
    const proposal = await declineProposal(auth.organizationId, proposalId);
    return Response.json({ data: proposal });
  } catch (error) {
    if (error instanceof ProposalNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof ProposalNotPendingError) return apiError(409, "not_pending", error.message);
    throw error;
  }
});
