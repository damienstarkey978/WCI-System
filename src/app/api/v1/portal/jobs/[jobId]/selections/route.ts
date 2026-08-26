/** GET /api/v1/portal/jobs/[jobId]/selections — selections + options for this job. */

import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const client = await authenticatePortalJobRequest(request, jobId, "canViewSelections");

    const selections = await db.selection.findMany({
      where: { organizationId: client.organizationId, jobId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { options: { orderBy: { sortOrder: "asc" }, include: { files: true } } },
    });

    return Response.json({ data: selections });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
