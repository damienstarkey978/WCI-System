/** /api/v1/bid-packages/[bidPackageId]/invite — invite a vendor to bid. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, inviteVendorToBidSchema } from "@/lib/api-schemas";
import {
  AlreadyInvitedError,
  BidPackageNotFoundError,
  BidPackageNotOpenError,
  inviteVendorToBid,
  VendorNotFoundError,
} from "@/lib/bids/service";

type Context = { params: Promise<{ bidPackageId: string }> };

export const POST = withApiAuth<Context>(["bids:write"], async (request, auth, context) => {
  const { bidPackageId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = inviteVendorToBidSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The vendor could not be invited.", formatZodIssues(parsed.error));
  }

  try {
    const submission = await inviteVendorToBid(auth.organizationId, bidPackageId, parsed.data.vendorId);
    return Response.json({ data: submission }, { status: 201 });
  } catch (error) {
    if (error instanceof BidPackageNotFoundError || error instanceof VendorNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof BidPackageNotOpenError) return apiError(409, "package_not_open", error.message);
    if (error instanceof AlreadyInvitedError) return apiError(409, "already_invited", error.message);
    throw error;
  }
});
