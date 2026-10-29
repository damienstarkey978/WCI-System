/**
 * /api/v1/permits/{permitId}/inspections — add an inspection to a permit.
 * Idempotent: same name on the same permit returns the existing row (200).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createPermitInspectionSchema, formatZodIssues } from "@/lib/api-schemas";
import { addPermitInspection, PermitNotFoundError } from "@/lib/permitting/service";

type Context = { params: Promise<{ permitId: string }> };

export const POST = withApiAuth<Context>(["permits:write"], async (request, auth, context) => {
  const { permitId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createPermitInspectionSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(
      422,
      "validation_failed",
      "The inspection could not be created.",
      formatZodIssues(parsed.error),
    );
  }

  try {
    const { inspection, created } = await addPermitInspection(
      auth.organizationId,
      permitId,
      parsed.data.name,
    );
    return Response.json({ data: inspection, created }, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof PermitNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof Error && error.message === "Inspection name is required.") {
      return apiError(422, "validation_failed", error.message);
    }
    throw error;
  }
});
