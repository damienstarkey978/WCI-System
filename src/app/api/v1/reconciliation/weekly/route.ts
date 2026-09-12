/**
 * /api/v1/reconciliation/weekly — Duke's weekly reconciliation job.
 *
 * POST triggers a run on demand (Duke, or Jarvis on his behalf); the scheduled Monday
 * run goes through /api/v1/cron/weekly-reconciliation instead, since a cron call has no
 * per-org API key to authenticate with. Both call the same
 * src/lib/reconciliation/weekly-service.ts, so "run it now" and "the weekly schedule
 * ran it" behave identically.
 *
 * GET lists recent runs so Duke/Jarvis can review history without recomputing anything
 * — same shape as GET /weekly-summaries.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, runWeeklyReconciliationSchema } from "@/lib/api-schemas";
import { QuickBooksNotConfiguredError } from "@/lib/quickbooks/client";
import { QuickBooksNotConnectedError } from "@/lib/quickbooks/connection-service";
import { listReconciliationRuns, runWeeklyReconciliation } from "@/lib/reconciliation/weekly-service";

const RECONCILIATION_SCOPES = ["bills:read", "purchase-orders:read"] as const;

export const GET = withApiAuth(RECONCILIATION_SCOPES, async (_request, auth) => {
  const runs = await listReconciliationRuns(auth.organizationId);
  return Response.json({ data: runs });
});

export const POST = withApiAuth(RECONCILIATION_SCOPES, async (request, auth) => {
  let payload: unknown = {};
  const text = await request.text();
  if (text.trim().length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
  }

  const parsed = runWeeklyReconciliationSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The reconciliation run could not be started.", formatZodIssues(parsed.error));
  }

  try {
    const summary = await runWeeklyReconciliation({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: summary }, { status: 201 });
  } catch (error) {
    if (error instanceof QuickBooksNotConfiguredError || error instanceof QuickBooksNotConnectedError) {
      return apiError(503, "quickbooks_not_connected", error.message);
    }
    throw error;
  }
});
