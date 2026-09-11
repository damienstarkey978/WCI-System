/**
 * /api/v1/bills/{billId}
 *
 * DELETE removes a bill still in the inbox or under review. Anything further along
 * is refused in favour of voiding it — see src/lib/financials/discard.ts.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { NotDiscardableError, RecordNotFoundError, deleteBill } from "@/lib/financials/discard";

type Context = { params: Promise<{ billId: string }> };

export const DELETE = withApiAuth<Context>(["bills:write"], async (_request, auth, context) => {
  const { billId } = await context.params;

  try {
    const deleted = await deleteBill(auth.organizationId, billId);
    return Response.json({ data: { deleted: true, ...deleted } });
  } catch (error) {
    if (error instanceof RecordNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof NotDiscardableError) return apiError(409, error.reason, error.message);
    throw error;
  }
});
