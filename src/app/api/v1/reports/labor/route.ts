/** /api/v1/reports/labor — approved labor cost vs. budgeted labor cost, per active job. */

import { withApiAuth } from "@/lib/api-auth";
import { getLaborReport } from "@/lib/reports/service";

export const GET = withApiAuth(["reports:read"], async (_request, auth) => {
  return Response.json({ data: await getLaborReport(auth.organizationId) });
});
