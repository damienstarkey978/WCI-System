/**
 * /api/v1/jobs/{jobId}/progress — schedule / todos / permits rollup for Atlas & Heather.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { getJobProgress, JobNotFoundError } from "@/lib/jobs/progress";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["jobs:read"], async (_request, auth, context) => {
  const { jobId } = await context.params;

  try {
    return Response.json({ data: await getJobProgress(auth.organizationId, jobId) });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(404, "not_found", `No job ${jobId} in this organization.`);
    }
    throw error;
  }
});
