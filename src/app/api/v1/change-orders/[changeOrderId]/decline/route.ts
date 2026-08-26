/** /api/v1/change-orders/{changeOrderId}/decline — no budget effect. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { ChangeOrderNotFoundError, ChangeOrderNotPendingError, declineChangeOrder } from "@/lib/change-orders/service";

type Context = { params: Promise<{ changeOrderId: string }> };

export const POST = withApiAuth<Context>(["change-orders:write"], async (_request, auth, context) => {
  const { changeOrderId } = await context.params;

  try {
    const changeOrder = await declineChangeOrder(auth.organizationId, changeOrderId);
    return Response.json({ data: changeOrder });
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof ChangeOrderNotPendingError) {
      return apiError(409, "not_pending", error.message);
    }
    throw error;
  }
});
