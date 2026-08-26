/** GET /api/v1/portal/jobs/[jobId]/schedule — client-visible schedule items, computed (CPM). */

import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";
import { getComputedSchedule } from "@/lib/scheduling/service";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const client = await authenticatePortalJobRequest(request, jobId, "canViewSchedule");

    const schedule = await db.schedule.findFirst({ where: { organizationId: client.organizationId, jobId } });
    if (!schedule) return Response.json({ data: null });

    const computed = await getComputedSchedule(client.organizationId, schedule.id);

    return Response.json({
      data: { ...computed, items: computed.items.filter((item) => item.clientVisible) },
    });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
