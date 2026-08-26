/**
 * /api/v1/jobs/{jobId}/budget — the commitment funnel for one job.
 *
 * This is the read model everything downstream depends on, and the endpoint Jarvis
 * and Duke use to see where a job actually stands.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { getJobBudget, JobNotFoundError } from "@/lib/budget/service";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["budgets:read"], async (_request, auth, context) => {
  const { jobId } = await context.params;

  try {
    return Response.json({ data: await getJobBudget(jobId, auth.organizationId) });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(404, "not_found", `No job ${jobId} in this organization.`);
    }
    throw error;
  }
});
