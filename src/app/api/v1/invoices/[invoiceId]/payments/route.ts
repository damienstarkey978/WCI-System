/**
 * /api/v1/invoices/{invoiceId}/payments — record a payment against an invoice.
 *
 * Manual/QBO-sync recording for now; Stripe card/ACH lands as its own integration
 * later and will call the same `recordPayment` service so status transitions and
 * the overpayment guard stay in one place.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, recordPaymentSchema } from "@/lib/api-schemas";
import {
  InvoiceNotFoundError,
  InvoiceVoidedError,
  recordPayment,
} from "@/lib/invoicing/service";
import { OverpaymentError } from "@/lib/invoicing/calc";

type Context = { params: Promise<{ invoiceId: string }> };

export const POST = withApiAuth<Context>(["invoices:write"], async (request, auth, context) => {
  const { invoiceId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = recordPaymentSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid payment.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  try {
    const result = await recordPayment({
      organizationId: auth.organizationId,
      invoiceId,
      method: input.method,
      amountCents: input.amountCents,
      reference: input.reference ?? null,
      receivedAt: input.receivedAt ?? undefined,
    });

    return Response.json(
      {
        data: {
          payment: result.payment,
          invoice: result.invoice,
          remainingCents: result.remainingCents,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof InvoiceVoidedError) {
      return apiError(409, "invoice_voided", error.message);
    }
    if (error instanceof OverpaymentError) {
      return apiError(422, "overpayment", error.message);
    }
    throw error;
  }
});
