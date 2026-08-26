/**
 * /api/v1/estimates/ai-draft — draft a full estimate from field notes.
 *
 * This is Neil's (estimator) handoff.ai-style entry point: give it a job and rough
 * notes, get back a DRAFT estimate built against the org's real cost code catalog,
 * ready for a human to review before it ever touches the budget. Same scope as
 * hand-authoring an estimate (`estimates:write`) — this is another way to create one,
 * not a different capability.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { aiDraftEstimateSchema, formatZodIssues } from "@/lib/api-schemas";
import { AiNotConfiguredError, DraftGenerationError } from "@/lib/ai/estimate-assistant";
import { createAiEstimateDraft, JobNotFoundError, NoCostCodesError } from "@/lib/ai/service";

export const POST = withApiAuth(["estimates:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = aiDraftEstimateSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid draft request.", formatZodIssues(parsed.error));
  }

  try {
    const result = await createAiEstimateDraft({
      organizationId: auth.organizationId,
      jobId: parsed.data.jobId,
      notes: parsed.data.notes,
    });
    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(422, "unknown_job", error.message);
    }
    if (error instanceof NoCostCodesError) {
      return apiError(422, "no_cost_codes", error.message);
    }
    if (error instanceof AiNotConfiguredError) {
      return apiError(503, "ai_not_configured", error.message);
    }
    if (error instanceof DraftGenerationError) {
      return apiError(502, "draft_generation_failed", error.message);
    }
    throw error;
  }
});
