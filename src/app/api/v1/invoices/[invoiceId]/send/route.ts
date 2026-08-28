/**
 * /api/v1/invoices/{invoiceId}/send
 *
 * Marks a DRAFT invoice as SENT. This is the transition that makes it count toward
 * `amountInvoiced` in the funnel (CLAUDE.md 2.3) — a draft sitting unsent should
 * never look like billed revenue. A dedicated action rather than a generic status
 * PATCH, matching the pattern used for PO approval and job status transitions.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { InvoiceNotFoundError, InvoiceNotSendableError, sendInvoice } from "@/lib/invoicing/service";

type Context = { params: Promise<{ invoiceId: string }> };

export const POST = withApiAuth<Context>(["invoices:write"], async (_request, auth, context) => {
  const { invoiceId } = await context.params;

  try {
    const { invoice, alreadySent } = await sendInvoice(auth.organizationId, invoiceId);
    return Response.json({ data: invoice, meta: alreadySent ? { alreadySent: true } : undefined });
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) {
      return apiError(404, "not_found", `No invoice ${invoiceId} in this organization.`);
    }
    if (error instanceof InvoiceNotSendableError) {
      return apiError(409, "not_sendable", error.message);
    }
    throw error;
  }
});
