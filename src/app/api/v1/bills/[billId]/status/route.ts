/**
 * /api/v1/bills/{billId}/status — AP approval routing.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateBillStatusSchema } from "@/lib/api-schemas";
import { BillNotFoundError, IllegalBillTransitionError, updateBillStatus } from "@/lib/bills/service";

type Context = { params: Promise<{ billId: string }> };

export const POST = withApiAuth<Context>(["bills:write"], async (request, auth, context) => {
  const { billId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = updateBillStatusSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid bill status request.", formatZodIssues(parsed.error));
  }

  try {
    const result = await updateBillStatus(auth.organizationId, billId, parsed.data.approvalStatus);
    const { unchanged, ...bill } = result;
    return Response.json({ data: bill, ...(unchanged ? { meta: { unchanged: true } } : {}) });
  } catch (error) {
    if (error instanceof BillNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof IllegalBillTransitionError) {
      return apiError(409, "illegal_transition", error.message, { currentStatus: error.currentStatus, allowed: error.allowed });
    }
    throw error;
  }
});
