/** POST /api/v1/estimates/{estimateId}/copy — versioned DRAFT copy (CR P2 #19). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { copyEstimate, EstimateNotFoundError } from "@/lib/estimates/service";

type Context = { params: Promise<{ estimateId: string }> };

export const POST = withApiAuth<Context>(["estimates:write"], async (_request, auth, context) => {
  const { estimateId } = await context.params;
  try {
    const estimate = await copyEstimate(auth.organizationId, estimateId);
    return Response.json({ data: estimate }, { status: 201 });
  } catch (error) {
    if (error instanceof EstimateNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
