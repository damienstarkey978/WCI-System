/** /api/v1/reports/invoicing — invoiced, paid, outstanding, and remaining, per active job. */

import { withApiAuth } from "@/lib/api-auth";
import { getInvoicingReport } from "@/lib/reports/service";

export const GET = withApiAuth(["reports:read"], async (_request, auth) => {
  return Response.json({ data: await getInvoicingReport(auth.organizationId) });
});
