/**
 * POST /api/v1/takeoffs/{takeoffId}/queue-purchasing — explicit Send to Purchasing.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, queueTakeoffPurchasingSchema } from "@/lib/api-schemas";
import {
  queueTakeoffForPurchasing,
  TakeoffLineNotFoundError,
  TakeoffLinesNotConvertibleError,
  TakeoffNotFoundError,
} from "@/lib/takeoffs/service";

type Context = { params: Promise<{ takeoffId: string }> };

export const POST = withApiAuth<Context>(["takeoffs:write"], async (request, auth, context) => {
  const { takeoffId } = await context.params;
  let payload: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) payload = JSON.parse(text);
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = queueTakeoffPurchasingSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Could not queue takeoff for purchasing.", formatZodIssues(parsed.error));
  }

  try {
    const result = await queueTakeoffForPurchasing({
      organizationId: auth.organizationId,
      takeoffId,
      lineIds: parsed.data.lineIds,
      vendorHint: parsed.data.vendorHint,
      notes: parsed.data.notes,
    });
    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof TakeoffNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof TakeoffLineNotFoundError) return apiError(422, "unknown_lines", error.message);
    if (error instanceof TakeoffLinesNotConvertibleError) {
      return apiError(409, "not_convertible", error.message);
    }
    throw error;
  }
});
