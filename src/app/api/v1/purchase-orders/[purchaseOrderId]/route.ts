/**
 * /api/v1/purchase-orders/{purchaseOrderId}
 *
 * DELETE removes a draft PO outright — for records that should never have existed
 * (an import artifact, a validation probe), not as a way to undo a commitment. See
 * src/lib/financials/discard.ts for why the bar is narrow.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { NotDiscardableError, RecordNotFoundError, deletePurchaseOrder } from "@/lib/financials/discard";

type Context = { params: Promise<{ purchaseOrderId: string }> };

export const DELETE = withApiAuth<Context>(["purchase-orders:write"], async (_request, auth, context) => {
  const { purchaseOrderId } = await context.params;

  try {
    const deleted = await deletePurchaseOrder(auth.organizationId, purchaseOrderId);
    return Response.json({ data: { deleted: true, ...deleted } });
  } catch (error) {
    if (error instanceof RecordNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof NotDiscardableError) return apiError(409, error.reason, error.message);
    throw error;
  }
});
