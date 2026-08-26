/**
 * /api/v1/estimates/{estimateId}/send-to-budget
 *
 * The explicit conversion action (CLAUDE.md 2.3): locks the estimate and materializes
 * the job's budget from it. A separate endpoint rather than a flag on the estimate,
 * because this is a domain action with side effects, not a field update.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  EmptyEstimateError,
  EstimateAlreadyLockedError,
  EstimateNotFoundError,
  sendEstimateToBudget,
} from "@/lib/budget/send-to-budget";
import { emitEvent } from "@/lib/webhooks";

type Context = { params: Promise<{ estimateId: string }> };

export const POST = withApiAuth<Context>(["estimates:write"], async (request, auth, context) => {
  const { estimateId } = await context.params;

  const allowResend = new URL(request.url).searchParams.get("allowResend") === "true";

  try {
    const result = await sendEstimateToBudget({
      estimateId,
      organizationId: auth.organizationId,
      allowResend,
    });

    await emitEvent(auth.organizationId, "estimate.sent_to_budget", {
      estimateId: result.estimateId,
      jobId: result.jobId,
      budgetLinesWritten: result.budgetLinesWritten,
      totalCostCents: result.totalCostCents,
      totalClientPriceCents: result.totalClientPriceCents,
    });

    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof EstimateNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof EstimateAlreadyLockedError) {
      return apiError(409, "already_sent", error.message);
    }
    if (error instanceof EmptyEstimateError) {
      return apiError(422, "empty_estimate", error.message);
    }
    throw error;
  }
});
