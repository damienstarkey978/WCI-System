/**
 * POST /api/v1/vendor-portal/warranty-claims/[claimId]/accept-trade — the
 * assigned trade confirms the warranty work is done. Same dual-auth shape as
 * PO acceptance: a portal session, or a single-use WARRANTY_TRADE_ACCEPTANCE
 * token scoped to this exact claim (see POST /warranty-claims/{id}/
 * trade-approval-link).
 */

import { VendorActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, extractToken } from "@/lib/api-auth";
import { formatZodIssues, portalAcceptWarrantyWorkSchema } from "@/lib/api-schemas";
import { authenticateVendorSession, InvalidActionTokenError, redeemActionToken } from "@/lib/vendor-portal/auth";
import { acceptTradeWork, VendorNotAssignedError, WarrantyClaimNotFoundError } from "@/lib/warranty/service";
import { db } from "@/lib/db";

type Context = { params: Promise<{ claimId: string }> };

export async function POST(request: Request, context: Context) {
  const { claimId } = await context.params;

  let payload: unknown = {};
  const rawBody = await request.text();
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
  }
  const parsed = portalAcceptWarrantyWorkSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The warranty claim could not be updated.", formatZodIssues(parsed.error));
  }

  const claim = await db.warrantyClaim.findUnique({ where: { id: claimId }, select: { id: true, organizationId: true } });
  if (!claim) return apiError(404, "not_found", `Warranty claim ${claimId} not found`);

  try {
    const session = await authenticateVendorSession(request);

    let result;
    if (session.ok) {
      if (session.context.organizationId !== claim.organizationId) {
        return apiError(404, "not_found", `Warranty claim ${claimId} not found`);
      }
      result = await acceptTradeWork({
        organizationId: claim.organizationId,
        claimId,
        vendorId: session.context.vendorId,
        signatureName: parsed.data.signatureName,
      });
    } else {
      const token = extractToken(request);
      if (!token) return apiError(401, "unauthorized", "A portal session or approval token is required.");
      result = await redeemActionToken(token, VendorActionTokenPurpose.WARRANTY_TRADE_ACCEPTANCE, claimId, (vendorId) =>
        acceptTradeWork({ organizationId: claim.organizationId, claimId, vendorId, signatureName: parsed.data.signatureName }),
      );
    }

    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof InvalidActionTokenError) return apiError(401, "invalid_token", error.message);
    if (error instanceof WarrantyClaimNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof VendorNotAssignedError) return apiError(403, "forbidden", error.message);
    throw error;
  }
}
