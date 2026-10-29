/**
 * /api/v1/jobs/{jobId}/permits — list building + MEP permits (read-only).
 * Seeding Building/MEP shells is POST .../permits/ensure-defaults (permits:write).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["permits:read"], async (_request, auth, context) => {
  const { jobId } = await context.params;

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!job) {
    return apiError(404, "not_found", `No job ${jobId} in this organization.`);
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
