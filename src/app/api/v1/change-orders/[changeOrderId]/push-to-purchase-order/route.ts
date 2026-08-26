/**
 * /api/v1/change-orders/{changeOrderId}/push-to-purchase-order
 *
 * Follow-up conversion for an approved CO (CLAUDE.md 3). Creates a PO tagged
 * sourceType=CHANGE_ORDER, sourceId back to this CO.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, pushChangeOrderToPurchaseOrderSchema } from "@/lib/api-schemas";
import {
  ChangeOrderNotApprovedError,
  ChangeOrderNotFoundError,
  pushChangeOrderToPurchaseOrder,
} from "@/lib/change-orders/service";

type Context = { params: Promise<{ changeOrderId: string }> };

export const POST = withApiAuth<Context>(["change-orders:write", "purchase-orders:write"], async (request, auth, context) => {
  const { changeOrderId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = pushChangeOrderToPurchaseOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid request.", formatZodIssues(parsed.error));
  }

  try {
    const purchaseOrder = await pushChangeOrderToPurchaseOrder(
      auth.organizationId,
      changeOrderId,
      parsed.data.poNumber,
      parsed.data.vendorName,
    );
    return Response.json({ data: purchaseOrder }, { status: 201 });
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof ChangeOrderNotApprovedError) {
      return apiError(409, "not_approved", error.message);
    }
    throw error;
  }
});
