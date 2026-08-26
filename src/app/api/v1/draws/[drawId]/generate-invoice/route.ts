/**
 * /api/v1/draws/{drawId}/generate-invoice
 *
 * Turns one draw into a draft PROGRESS invoice, priced from the job's current
 * revised client price (CLAUDE.md 2.3: "DrawSchedule -> Draw ... autoGeneratesInvoiceOnDate").
 * A draw generates at most one invoice — call this again only after voiding the prior one.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  DrawAlreadyInvoicedError,
  DrawNotFoundError,
  generateDraftInvoiceForDraw,
  NoBudgetError,
} from "@/lib/invoicing/service";
import { emitEvent } from "@/lib/webhooks";

type Context = { params: Promise<{ drawId: string }> };

export const POST = withApiAuth<Context>(["invoices:write"], async (_request, auth, context) => {
  const { drawId } = await context.params;

  try {
    const invoice = await generateDraftInvoiceForDraw(auth.organizationId, drawId);

    await emitEvent(auth.organizationId, "invoice.created", {
      invoiceId: invoice.id,
      jobId: invoice.jobId,
      drawId,
      amountCents: invoice.amountCents,
    });

    return Response.json({ data: invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof DrawNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof DrawAlreadyInvoicedError) {
      return apiError(409, "already_invoiced", error.message);
    }
    if (error instanceof NoBudgetError) {
      return apiError(422, "no_budget", error.message);
    }
    throw error;
  }
});
