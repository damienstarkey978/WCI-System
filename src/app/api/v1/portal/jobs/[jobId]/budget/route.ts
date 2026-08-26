/**
 * GET /api/v1/portal/jobs/[jobId]/budget — client pricing only (never cost or
 * profit). Off by default (ClientJobAccess.canViewBudget) per CLAUDE.md 3.
 */

import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/client-portal/auth";
import { getClientBudgetView } from "@/lib/client-portal/service";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const client = await authenticatePortalJobRequest(request, jobId, "canViewBudget");
    const view = await getClientBudgetView(client.organizationId, jobId);
    return Response.json({ data: view });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
