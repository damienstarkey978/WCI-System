/** /api/v1/proposals/[proposalId]/send — mark a proposal SENT. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { ProposalNotDraftError, ProposalNotFoundError, sendProposal } from "@/lib/proposals/service";

type Context = { params: Promise<{ proposalId: string }> };

export const POST = withApiAuth<Context>(["proposals:write"], async (_request, auth, context) => {
  const { proposalId } = await context.params;

  try {
    const proposal = await sendProposal(auth.organizationId, proposalId);
    return Response.json({ data: proposal });
  } catch (error) {
    if (error instanceof ProposalNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof ProposalNotDraftError) return apiError(409, "not_draft", error.message);
    throw error;
  }
});
