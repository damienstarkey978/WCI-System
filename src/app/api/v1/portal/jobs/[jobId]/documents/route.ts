/** GET /api/v1/portal/jobs/[jobId]/documents — client-visible files. */

import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const client = await authenticatePortalJobRequest(request, jobId, "canViewDocuments");

    const files = await db.file.findMany({
      where: { organizationId: client.organizationId, jobId, clientVisible: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return Response.json({ data: files });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
