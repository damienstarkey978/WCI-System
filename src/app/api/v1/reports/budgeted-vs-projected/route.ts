/** /api/v1/reports/budgeted-vs-projected — revised budget vs. projected cost, per active job. */

import { withApiAuth } from "@/lib/api-auth";
import { getBudgetedVsProjectedReport } from "@/lib/reports/service";

export const GET = withApiAuth(["reports:read"], async (_request, auth) => {
  return Response.json({ data: await getBudgetedVsProjectedReport(auth.organizationId) });
});
