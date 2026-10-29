/**
 * /api/v1/permit-inspections/{inspectionId} — update result / pass date / etc.; DELETE removes it.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, parseOptionalDate, updatePermitInspectionSchema } from "@/lib/api-schemas";
import {
  InspectionNotFoundError,
  removePermitInspection,
  updateInspectionFields,
} from "@/lib/permitting/service";

type Context = { params: Promise<{ inspectionId: string }> };

export const DELETE = withApiAuth<Context>(["permits:write"], async (_request, auth, context) => {
  const { inspectionId } = await context.params;
  try {
    await removePermitInspection(auth.organizationId, inspectionId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof InspectionNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});

export const PATCH = withApiAuth<Context>(["permits:write"], async (request, auth, context) => {
  const { inspectionId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = updatePermitInspectionSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The inspection could not be updated.", formatZodIssues(parsed.error));
  }

  try {
    const inspection = await updateInspectionFields(auth.organizationId, inspectionId, {
      completed: parsed.data.completed,
      result: parsed.data.result,
      passedAt: parseOptionalDate(parsed.data.passedAt),
      confirmationNumber: parsed.data.confirmationNumber,
      inspector: parsed.data.inspector,
    });
    return Response.json({ data: inspection });
  } catch (error) {
    if (error instanceof InspectionNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
