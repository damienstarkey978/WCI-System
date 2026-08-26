/**
 * /api/v1/reports/cash-flow — rolling window of historical cash in/out, plus a
 * forward-looking projection blended from the Budget's remainingToInvoice and
 * costToComplete (CLAUDE.md 3).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { getCashFlowReport } from "@/lib/reports/service";

export const GET = withApiAuth(["reports:read"], async (request, auth) => {
  const windowDaysParam = new URL(request.url).searchParams.get("windowDays");
  const windowDays = windowDaysParam ? Number(windowDaysParam) : 30;

  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) {
    return apiError(400, "invalid_query", "windowDays must be an integer between 1 and 365.");
  }

  return Response.json({ data: await getCashFlowReport(auth.organizationId, { windowDays }) });
});
