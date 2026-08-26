/**
 * /api/v1/warranty-claims/[claimId]/trade-approval-link — issue a headless
 * link for the assigned trade to confirm the work is done, no login required.
 */

import { VendorActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, requestVendorApprovalLinkSchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { issueApprovalLink, VendorNotFoundError } from "@/lib/vendor-portal/auth";

type Context = { params: Promise<{ claimId: string }> };

export const POST = withApiAuth<Context>(["warranty:write"], async (request, auth, context) => {
  const { claimId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = requestVendorApprovalLinkSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The approval link could not be issued.", formatZodIssues(parsed.error));
  }

  const claim = await db.warrantyClaim.findFirst({ where: { id: claimId, organizationId: auth.organizationId }, select: { id: true } });
  if (!claim) return apiError(404, "not_found", `Warranty claim ${claimId} not found`);

  try {
    const { token } = await issueApprovalLink({
      organizationId: auth.organizationId,
      vendorId: parsed.data.vendorId,
      purpose: VendorActionTokenPurpose.WARRANTY_TRADE_ACCEPTANCE,
      resourceId: claimId,
    });
    return Response.json({ data: { token } }, { status: 201 });
  } catch (error) {
    if (error instanceof VendorNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
