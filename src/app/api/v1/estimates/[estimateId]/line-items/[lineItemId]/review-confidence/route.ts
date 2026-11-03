/**
 * POST /api/v1/estimates/{estimateId}/line-items/{lineItemId}/review-confidence
 * Staff marks a LOW/MEDIUM AI line reviewed (CR P3 #28).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  EstimateLineItemNotFoundError,
  EstimateNotEditableError,
  EstimateNotFoundError,
  markEstimateLineConfidenceReviewed,
} from "@/lib/estimates/service";

type Context = { params: Promise<{ estimateId: string; lineItemId: string }> };

export const POST = withApiAuth<Context>(["estimates:write"], async (_request, auth, context) => {
  const { estimateId, lineItemId } = await context.params;
  try {
    const line = await markEstimateLineConfidenceReviewed(auth.organizationId, estimateId, lineItemId);
    return Response.json({ data: line });
  } catch (error) {
    if (error instanceof EstimateNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof EstimateLineItemNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof EstimateNotEditableError) return apiError(409, "not_editable", error.message);
    throw error;
  }
});
