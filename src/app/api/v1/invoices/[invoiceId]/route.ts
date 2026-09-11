/**
 * /api/v1/invoices/{invoiceId}
 *
 * DELETE removes an unsent draft invoice with nothing settled against it. A sent
 * invoice is voided instead — see src/lib/financials/discard.ts.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { NotDiscardableError, RecordNotFoundError, deleteInvoice } from "@/lib/financials/discard";

type Context = { params: Promise<{ invoiceId: string }> };

export const DELETE = withApiAuth<Context>(["invoices:write"], async (_request, auth, context) => {
  const { invoiceId } = await context.params;

  try {
    const deleted = await deleteInvoice(auth.organizationId, invoiceId);
    return Response.json({ data: { deleted: true, ...deleted } });
  } catch (error) {
    if (error instanceof RecordNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof NotDiscardableError) return apiError(409, error.reason, error.message);
    throw error;
  }
});
