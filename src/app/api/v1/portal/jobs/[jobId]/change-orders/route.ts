/** GET /api/v1/portal/jobs/[jobId]/change-orders — change orders for this job. */

import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const client = await authenticatePortalJobRequest(request, jobId, "canViewChangeOrders");

    const changeOrders = await db.changeOrder.findMany({
      where: { organizationId: client.organizationId, jobId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    return Response.json({ data: changeOrders });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
