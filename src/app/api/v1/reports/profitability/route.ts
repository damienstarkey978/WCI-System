/** /api/v1/reports/profitability — projected profit and margin, worst margin first. */

import { withApiAuth } from "@/lib/api-auth";
import { getProfitabilityReport } from "@/lib/reports/service";

export const GET = withApiAuth(["reports:read"], async (_request, auth) => {
  return Response.json({ data: await getProfitabilityReport(auth.organizationId) });
});
