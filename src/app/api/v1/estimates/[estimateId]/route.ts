/**
 * GET/PUT /api/v1/estimates/{estimateId} — fetch / update a DRAFT estimate (CR P2 #19).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateEstimateSchema } from "@/lib/api-schemas";
import {
  EstimateNotEditableError,
  EstimateNotFoundError,
  getEstimate,
  updateEstimate,
} from "@/lib/estimates/service";

type Context = { params: Promise<{ estimateId: string }> };

export const GET = withApiAuth<Context>(["estimates:read"], async (_request, auth, context) => {
  const { estimateId } = await context.params;
  try {
    const estimate = await getEstimate(auth.organizationId, estimateId);
    return Response.json({ data: estimate });
  } catch (error) {
    if (error instanceof EstimateNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});

export const PUT = withApiAuth<Context>(["estimates:write"], async (request, auth, context) => {
  const { estimateId } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  const parsed = updateEstimateSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The estimate could not be updated.", formatZodIssues(parsed.error));
  }

  try {
    const estimate = await updateEstimate({
      organizationId: auth.organizationId,
      estimateId,
      ...parsed.data,
    });
    return Response.json({ data: estimate });
  } catch (error) {
    if (error instanceof EstimateNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof EstimateNotEditableError) return apiError(409, "not_editable", error.message);
    throw error;
  }
});
