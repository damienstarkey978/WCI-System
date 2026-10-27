/**
 * /api/v1/jobs/{jobId}/permits — list (and lazily seed) building + MEP permits.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { ensureDefaultPermits, JobNotFoundError } from "@/lib/permitting/service";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["permits:read"], async (_request, auth, context) => {
  const { jobId } = await context.params;

  try {
    await ensureDefaultPermits(auth.organizationId, jobId);
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(404, "not_found", `No job ${jobId} in this organization.`);
    }
    throw error;
  }

  const permits = await db.jobPermit.findMany({
    where: { jobId, organizationId: auth.organizationId },
    orderBy: { trade: "asc" },
    include: {
      vendor: { select: { id: true, name: true, email: true } },
      inspections: { orderBy: { sortOrder: "asc" } },
    },
  });

  return Response.json({ data: permits });
});
