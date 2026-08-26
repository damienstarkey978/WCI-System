/**
 * POST /api/v1/vendor-portal/purchase-orders/[purchaseOrderId]/accept — the
 * vendor-facing side of acceptPurchaseOrder(). Same dual-auth shape as the
 * Client Portal's Change Order approval: a portal session (no extra module
 * gate — accepting your own PO isn't behind a toggle) or a single-use
 * PO_ACCEPTANCE token scoped to this exact PO.
 */

import { VendorActionTokenPurpose } from "@/generated/prisma/enums";
import { apiError, extractToken } from "@/lib/api-auth";
import { formatZodIssues, portalAcceptPurchaseOrderSchema } from "@/lib/api-schemas";
import { authenticateVendorSession, InvalidActionTokenError, redeemActionToken } from "@/lib/vendor-portal/auth";
import {
  acceptPurchaseOrder,
  PurchaseOrderNotAcceptableError,
  PurchaseOrderNotAssignedToVendorError,
  PurchaseOrderNotFoundError,
} from "@/lib/vendor-portal/service";
import { db } from "@/lib/db";

type Context = { params: Promise<{ purchaseOrderId: string }> };

function clientIp(request: Request): string | undefined {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}

export async function POST(request: Request, context: Context) {
  const { purchaseOrderId } = await context.params;

  let payload: unknown = {};
  const rawBody = await request.text();
  if (rawBody.length > 0) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
  }
  const parsed = portalAcceptPurchaseOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The purchase order could not be accepted.", formatZodIssues(parsed.error));
  }

  const purchaseOrder = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { id: true, organizationId: true },
  });
  if (!purchaseOrder) return apiError(404, "not_found", `Purchase order ${purchaseOrderId} not found`);

  try {
    const session = await authenticateVendorSession(request);

    let result;
    if (session.ok) {
      if (session.context.organizationId !== purchaseOrder.organizationId) {
        return apiError(404, "not_found", `Purchase order ${purchaseOrderId} not found`);
      }
      result = await acceptPurchaseOrder({
        organizationId: purchaseOrder.organizationId,
        purchaseOrderId,
        vendorId: session.context.vendorId,
        signatureName: parsed.data.signatureName,
        signatureIp: clientIp(request),
      });
    } else {
      const token = extractToken(request);
      if (!token) return apiError(401, "unauthorized", "A portal session or approval token is required.");
      result = await redeemActionToken(token, VendorActionTokenPurpose.PO_ACCEPTANCE, purchaseOrderId, (vendorId) =>
        acceptPurchaseOrder({
          organizationId: purchaseOrder.organizationId,
          purchaseOrderId,
          vendorId,
          signatureName: parsed.data.signatureName,
          signatureIp: clientIp(request),
        }),
      );
    }

    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof InvalidActionTokenError) return apiError(401, "invalid_token", error.message);
    if (error instanceof PurchaseOrderNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof PurchaseOrderNotAssignedToVendorError) return apiError(403, "forbidden", error.message);
    if (error instanceof PurchaseOrderNotAcceptableError) return apiError(409, "not_acceptable", error.message);
    throw error;
  }
}
