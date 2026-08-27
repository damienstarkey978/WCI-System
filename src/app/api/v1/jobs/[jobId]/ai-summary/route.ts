/**
 * /api/v1/jobs/{jobId}/ai-summary — a free-text status digest of one job for
 * staff/agents (Jarvis, Hank, Duke, ...). Scoped under jobs:read, not a separate
 * scope, since it's fundamentally "read this job's state, summarized" — anyone who
 * can already read the job's budget/schedule/RFIs individually can read this.
 *
 * Deliberately POST, not GET: this calls Claude on every request (not idempotent,
 * not free), matching the same convention as /estimates/ai-draft and
 * /specifications/generate-from-estimate. It is never persisted — see
 * src/lib/ai/job-summary-assistant.ts's header comment for why.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { AiNotConfiguredError, SummaryGenerationError } from "@/lib/ai/job-summary-assistant";
import { createJobSummary, JobNotFoundError } from "@/lib/ai/job-summary-service";

type Context = { params: Promise<{ jobId: string }> };

export const POST = withApiAuth<Context>(["jobs:read"], async (_request, auth, context) => {
  const { jobId } = await context.params;

  try {
    const result = await createJobSummary({ organizationId: auth.organizationId, jobId });
    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(404, "not_found", `No job ${jobId} in this organization.`);
    if (error instanceof AiNotConfiguredError) return apiError(503, "ai_not_configured", error.message);
    if (error instanceof SummaryGenerationError) return apiError(502, "summary_generation_failed", error.message);
    throw error;
  }
});
