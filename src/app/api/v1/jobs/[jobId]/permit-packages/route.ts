/**
 * GET /api/v1/jobs/{jobId}/permit-packages — list packages for a job (Heather / agents).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { listPermitPackagesForJob } from "@/lib/permitting/packages";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["permits:read"], async (_request, auth, context) => {
  const { jobId } = await context.params;
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!job) return apiError(404, "not_found", "Job not found.");
  const packages = await listPermitPackagesForJob(auth.organizationId, jobId);
  return Response.json({ data: packages });
});
