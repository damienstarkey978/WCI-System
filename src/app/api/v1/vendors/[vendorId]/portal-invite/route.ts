/**
 * /api/v1/vendors/[vendorId]/portal-invite — issue a one-time portal login
 * link, same convention as ApiKey issuance and the Client Portal equivalent.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { issuePortalLoginInvite, VendorNotFoundError } from "@/lib/vendor-portal/auth";

type Context = { params: Promise<{ vendorId: string }> };

export const POST = withApiAuth<Context>(["vendors:write"], async (_request, auth, context) => {
  const { vendorId } = await context.params;

  try {
    const { token } = await issuePortalLoginInvite(auth.organizationId, vendorId);
    return Response.json({ data: { token } }, { status: 201 });
  } catch (error) {
    if (error instanceof VendorNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
