/** /api/v1/bid-submissions/[bidSubmissionId]/lock — freeze against further edits. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { BidSubmissionNotFoundError, lockBidSubmission } from "@/lib/bids/service";

type Context = { params: Promise<{ bidSubmissionId: string }> };

export const POST = withApiAuth<Context>(["bids:write"], async (_request, auth, context) => {
  const { bidSubmissionId } = await context.params;

  try {
    const submission = await lockBidSubmission(auth.organizationId, bidSubmissionId);
    return Response.json({ data: submission });
  } catch (error) {
    if (error instanceof BidSubmissionNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
