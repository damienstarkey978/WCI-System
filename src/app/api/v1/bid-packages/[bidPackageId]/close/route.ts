/** /api/v1/bid-packages/[bidPackageId]/close — close or award a bid package. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { closeBidPackageSchema, formatZodIssues } from "@/lib/api-schemas";
import { BidPackageNotFoundError, closeBidPackage, NoAcceptedSubmissionsError } from "@/lib/bids/service";

type Context = { params: Promise<{ bidPackageId: string }> };

export const POST = withApiAuth<Context>(["bids:write"], async (request, auth, context) => {
  const { bidPackageId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = closeBidPackageSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The bid package could not be closed.", formatZodIssues(parsed.error));
  }

  try {
    const bidPackage = await closeBidPackage({ organizationId: auth.organizationId, bidPackageId, status: parsed.data.status });
    return Response.json({ data: bidPackage });
  } catch (error) {
    if (error instanceof BidPackageNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof NoAcceptedSubmissionsError) return apiError(409, "no_accepted_submissions", error.message);
    throw error;
  }
});
