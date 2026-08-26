/** GET /api/v1/portal/jobs/[jobId]/daily-logs — client-visible daily logs. */

import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const client = await authenticatePortalJobRequest(request, jobId, "canViewDailyLogs");

    const dailyLogs = await db.dailyLog.findMany({
      where: { organizationId: client.organizationId, jobId, clientVisible: true },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { files: { where: { clientVisible: true } } },
    });

    return Response.json({ data: dailyLogs });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
