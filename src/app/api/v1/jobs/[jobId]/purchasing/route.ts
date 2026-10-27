/**
 * GET /api/v1/jobs/{jobId}/purchasing — job purchasing rollup for Duke/Jarvis/staff.
 * Purchased vs not-yet, queued intents, PO order statuses — reads commitment funnel
 * / POs rather than inventing a parallel AP model.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  JobNotFoundForPurchasingError,
  loadJobPurchasingSummary,
} from "@/lib/takeoffs/load-purchasing-summary";

type Context = { params: Promise<{ jobId: string }> };

export const GET = withApiAuth<Context>(["purchase-orders:read"], async (_request, auth, context) => {
  const { jobId } = await context.params;
  try {
    const { job, summary } = await loadJobPurchasingSummary(auth.organizationId, jobId);
    return Response.json({ data: { jobId: job.id, jobName: job.name, ...summary } });
  } catch (error) {
    if (error instanceof JobNotFoundForPurchasingError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
