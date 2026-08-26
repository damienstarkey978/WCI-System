/**
 * /api/v1/invoices/{invoiceId}/send
 *
 * Marks a DRAFT invoice as SENT. This is the transition that makes it count toward
 * `amountInvoiced` in the funnel (CLAUDE.md 2.3) — a draft sitting unsent should
 * never look like billed revenue. A dedicated action rather than a generic status
 * PATCH, matching the pattern used for PO approval and job status transitions.
 */

import { InvoiceStatus } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ invoiceId: string }> };

export const POST = withApiAuth<Context>(["invoices:write"], async (_request, auth, context) => {
  const { invoiceId } = await context.params;

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId: auth.organizationId },
  });
  if (!invoice) {
    return apiError(404, "not_found", `No invoice ${invoiceId} in this organization.`);
  }

  if (invoice.status === InvoiceStatus.SENT) {
    return Response.json({ data: invoice, meta: { alreadySent: true } });
  }
  if (invoice.status !== InvoiceStatus.DRAFT) {
    return apiError(409, "not_sendable", `A ${invoice.status} invoice cannot be sent.`, {
      currentStatus: invoice.status,
    });
  }

  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: { status: InvoiceStatus.SENT, issuedOn: invoice.issuedOn ?? new Date() },
  });

  return Response.json({ data: updated });
});
