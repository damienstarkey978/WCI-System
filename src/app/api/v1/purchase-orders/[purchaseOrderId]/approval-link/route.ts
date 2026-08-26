/**
 * /api/v1/purchase-orders/[purchaseOrderId]/approval-link — issue a
 * single-use headless link for a vendor to e-sign/accept a PO with no login
 * (CLAUDE.md 2.3), same pattern as the Change Order and Selection links.
 */

import { VendorActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, requestVendorApprovalLinkSchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { issueApprovalLink, VendorNotFoundError } from "@/lib/vendor-portal/auth";

type Context = { params: Promise<{ purchaseOrderId: string }> };

export const POST = withApiAuth<Context>(["purchase-orders:write"], async (request, auth, context) => {
  const { purchaseOrderId } = await context.params;

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

  const purchaseOrder = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!purchaseOrder) return apiError(404, "not_found", `Purchase order ${purchaseOrderId} not found`);

  try {
    const { token } = await issueApprovalLink({
      organizationId: auth.organizationId,
      vendorId: parsed.data.vendorId,
      purpose: VendorActionTokenPurpose.PO_ACCEPTANCE,
      resourceId: purchaseOrderId,
    });
    return Response.json({ data: { token } }, { status: 201 });
  } catch (error) {
    if (error instanceof VendorNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
