/** /api/v1/reports/wip — Work In Progress: earned revenue vs. billed, per active job. */

import { withApiAuth } from "@/lib/api-auth";
import { getWipReport } from "@/lib/reports/service";

export const GET = withApiAuth(["reports:read"], async (_request, auth) => {
  return Response.json({ data: await getWipReport(auth.organizationId) });
});
