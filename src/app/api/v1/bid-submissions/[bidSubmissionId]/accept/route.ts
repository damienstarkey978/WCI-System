/** /api/v1/bid-submissions/[bidSubmissionId]/accept — award this submission. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  acceptBidSubmission,
  BidSubmissionAlreadyDecidedError,
  BidSubmissionNotFoundError,
  BidSubmissionNotSubmittedError,
} from "@/lib/bids/service";

type Context = { params: Promise<{ bidSubmissionId: string }> };

export const POST = withApiAuth<Context>(["bids:write"], async (_request, auth, context) => {
  const { bidSubmissionId } = await context.params;

  try {
    const submission = await acceptBidSubmission(auth.organizationId, bidSubmissionId);
    return Response.json({ data: submission });
  } catch (error) {
    if (error instanceof BidSubmissionNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof BidSubmissionAlreadyDecidedError) return apiError(409, "already_decided", error.message);
    if (error instanceof BidSubmissionNotSubmittedError) return apiError(409, "not_submitted", error.message);
    throw error;
  }
});
