/** /api/v1/weekly-summaries — generate/list AI weekly client-update digests. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, generateWeeklySummarySchema } from "@/lib/api-schemas";
import { AiNotConfiguredError, SummaryGenerationError } from "@/lib/ai/weekly-summary-assistant";
import { createWeeklySummary, JobNotFoundError, listWeeklySummaries } from "@/lib/ai/weekly-summary-service";

export const GET = withApiAuth(["weekly-summaries:read"], async (request, auth) => {
  const jobId = new URL(request.url).searchParams.get("jobId");

  const summaries = await listWeeklySummaries({ organizationId: auth.organizationId, jobId: jobId ?? undefined });

  return Response.json({ data: summaries });
});

export const POST = withApiAuth(["weekly-summaries:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = generateWeeklySummarySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The weekly summary could not be generated.", formatZodIssues(parsed.error));
  }

  try {
    const summary = await createWeeklySummary({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: summary }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    if (error instanceof AiNotConfiguredError) return apiError(503, "ai_not_configured", error.message);
    if (error instanceof SummaryGenerationError) return apiError(502, "summary_generation_failed", error.message);
    throw error;
  }
});
