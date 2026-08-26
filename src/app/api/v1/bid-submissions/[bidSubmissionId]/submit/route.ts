/**
 * /api/v1/bid-submissions/[bidSubmissionId]/submit — staff/agent submits or
 * edits a bid on the vendor's behalf (CLAUDE.md 3's "builder-edit-on-behalf",
 * e.g. transcribing a phone bid). The vendor-portal equivalent is
 * POST /vendor-portal/bid-submissions/{id}/submit.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, submitBidSchema } from "@/lib/api-schemas";
import {
  BidSubmissionAlreadyDecidedError,
  BidSubmissionLockedError,
  BidSubmissionNotFoundError,
  submitBid,
} from "@/lib/bids/service";

type Context = { params: Promise<{ bidSubmissionId: string }> };

export const POST = withApiAuth<Context>(["bids:write"], async (request, auth, context) => {
  const { bidSubmissionId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = submitBidSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The bid could not be submitted.", formatZodIssues(parsed.error));
  }

  try {
    const submission = await submitBid({
      organizationId: auth.organizationId,
      bidSubmissionId,
      asStaff: true,
      ...parsed.data,
    });
    return Response.json({ data: submission });
  } catch (error) {
    if (error instanceof BidSubmissionNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof BidSubmissionLockedError) return apiError(409, "locked", error.message);
    if (error instanceof BidSubmissionAlreadyDecidedError) return apiError(409, "already_decided", error.message);
    throw error;
  }
});
