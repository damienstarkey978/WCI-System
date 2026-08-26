/**
 * /api/v1/jobs/{jobId} — fetch a single job with its lifecycle history.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { allowedNextStatuses } from "@/lib/job-status";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["jobs:read"], async (_request, auth, context) => {
  const { jobId } = await context.params;

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: auth.organizationId },
    include: {
      jobGroup: { select: { id: true, name: true } },
      statusEvents: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  if (!job) {
    return apiError(404, "not_found", `No job ${jobId} in this organization.`);
  }

  return Response.json({
    data: job,
    meta: { allowedNextStatuses: allowedNextStatuses(job.status) },
  });
});
