/**
 * GET /api/v1/jobs/{jobId}/takeoffs — list takeoffs for a job (Jarvis/Duke/Hank/Neil).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { listTakeoffsForJob } from "@/lib/takeoffs/service";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["takeoffs:read"], async (_request, auth, context) => {
  const { jobId } = await context.params;
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!job) return apiError(404, "not_found", `Job ${jobId} not found.`);

  const takeoffs = await listTakeoffsForJob(auth.organizationId, job.id);
  return Response.json({
    data: takeoffs.map((takeoff) => ({
      id: takeoff.id,
      title: takeoff.title,
      status: takeoff.status,
      aiGenerated: takeoff.aiGenerated,
      lineItemCount: takeoff.lines.length,
      createdAt: takeoff.createdAt.toISOString(),
    })),
  });
});
