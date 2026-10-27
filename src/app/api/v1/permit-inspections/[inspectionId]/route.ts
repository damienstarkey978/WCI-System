/**
 * /api/v1/permit-inspections/{inspectionId} — mark an inspection complete / incomplete.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updatePermitInspectionSchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { InspectionNotFoundError, setInspectionCompleted } from "@/lib/permitting/service";

type Context = { params: Promise<{ inspectionId: string }> };

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
    await setInspectionCompleted(auth.organizationId, inspectionId, parsed.data.completed);
    const inspection = await db.jobPermitInspection.findFirst({
      where: { id: inspectionId, permit: { organizationId: auth.organizationId } },
    });
    if (!inspection) throw new InspectionNotFoundError(inspectionId);
    return Response.json({ data: inspection });
  } catch (error) {
    if (error instanceof InspectionNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
