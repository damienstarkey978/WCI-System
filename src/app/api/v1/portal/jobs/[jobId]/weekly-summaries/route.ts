/**
 * GET /api/v1/portal/jobs/[jobId]/weekly-summaries — the client's AI weekly-update
 * digests. Gated on canViewDailyLogs (reused, not a new per-entity flag — CLAUDE.md
 * Phase 8 deviations) since a digest is exactly the same kind of narrative update a
 * daily log is, just AI-written and weekly instead of per-visit.
 */

import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/client-portal/auth";
import { listWeeklySummaries } from "@/lib/ai/weekly-summary-service";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const client = await authenticatePortalJobRequest(request, jobId, "canViewDailyLogs");

    const summaries = await listWeeklySummaries({ organizationId: client.organizationId, jobId });

    return Response.json({ data: summaries });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
