/**
 * POST /api/v1/vendor-portal/bid-submissions/[bidSubmissionId]/submit — a
 * vendor submits or edits their own bid. The staff/agent equivalent (editing
 * on the vendor's behalf) is POST /bid-submissions/{id}/submit.
 */

import { apiError } from "@/lib/api-auth";
import { formatZodIssues, submitBidSchema } from "@/lib/api-schemas";
import { authenticateVendorSession } from "@/lib/vendor-portal/auth";
import {
  BidSubmissionAlreadyDecidedError,
  BidSubmissionLockedError,
  BidSubmissionNotFoundError,
  submitBid,
  VendorNotAssignedToSubmissionError,
} from "@/lib/bids/service";

type Context = { params: Promise<{ bidSubmissionId: string }> };

export async function POST(request: Request, context: Context) {
  const { bidSubmissionId } = await context.params;

  const auth = await authenticateVendorSession(request);
  if (!auth.ok) return apiError(401, "unauthorized", "A valid portal session is required.");

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
      organizationId: auth.context.organizationId,
      bidSubmissionId,
      asVendorId: auth.context.vendorId,
      ...parsed.data,
    });
    return Response.json({ data: submission });
  } catch (error) {
    if (error instanceof BidSubmissionNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof VendorNotAssignedToSubmissionError) return apiError(403, "forbidden", error.message);
    if (error instanceof BidSubmissionLockedError) return apiError(409, "locked", error.message);
    if (error instanceof BidSubmissionAlreadyDecidedError) return apiError(409, "already_decided", error.message);
    throw error;
  }
}
