/**
 * /api/v1/change-orders/{changeOrderId}/approve
 *
 * The explicit conversion action: applies the CO's cost/price deltas onto the
 * job's Budget and marks it APPROVED. Optionally carries the client's e-signature.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { approveChangeOrderSchema, formatZodIssues } from "@/lib/api-schemas";
import {
  approveChangeOrder,
  ChangeOrderNotFoundError,
  ChangeOrderNotPendingError,
  EmptyChangeOrderError,
  IncompleteFlatChangeOrderError,
} from "@/lib/change-orders/service";

type Context = { params: Promise<{ changeOrderId: string }> };

export const POST = withApiAuth<Context>(["change-orders:write"], async (request, auth, context) => {
  const { changeOrderId } = await context.params;

  let payload: unknown = {};
  const text = await request.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
  }

  const parsed = approveChangeOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid approval request.", formatZodIssues(parsed.error));
  }

  try {
    const result = await approveChangeOrder({
      organizationId: auth.organizationId,
      changeOrderId,
      clientSignatureName: parsed.data.clientSignatureName,
      clientSignatureIp: parsed.data.clientSignatureIp,
    });
    return Response.json({ data: result.changeOrder, meta: { budgetDeltas: result.deltas } });
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof ChangeOrderNotPendingError) {
      return apiError(409, "not_pending", error.message);
    }
    if (error instanceof IncompleteFlatChangeOrderError || error instanceof EmptyChangeOrderError) {
      return apiError(422, "incomplete_change_order", error.message);
    }
    throw error;
  }
});
