/**
 * /api/v1/takeoffs/ai-draft — draft a quantity takeoff from plan/measurement notes.
 * Always DRAFT for human review — never queues purchasing or creates a PO.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { aiDraftTakeoffSchema, formatZodIssues } from "@/lib/api-schemas";
import { AiNotConfiguredError, DraftGenerationError } from "@/lib/ai/takeoff-assistant";
import { createAiTakeoffDraft, JobNotFoundError, NoCostCodesError } from "@/lib/ai/takeoff-service";

export const POST = withApiAuth(["takeoffs:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = aiDraftTakeoffSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid takeoff draft request.", formatZodIssues(parsed.error));
  }

  try {
    const result = await createAiTakeoffDraft({
      organizationId: auth.organizationId,
      jobId: parsed.data.jobId,
      notes: parsed.data.notes,
    });
    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    if (error instanceof NoCostCodesError) return apiError(422, "no_cost_codes", error.message);
    if (error instanceof AiNotConfiguredError) return apiError(503, "ai_not_configured", error.message);
    if (error instanceof DraftGenerationError) return apiError(502, "draft_generation_failed", error.message);
    throw error;
  }
});
