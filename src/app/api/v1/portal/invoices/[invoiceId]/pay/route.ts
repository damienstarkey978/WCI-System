/**
 * POST /api/v1/portal/invoices/[invoiceId]/pay — create a Stripe PaymentIntent
 * for the invoice's remaining balance. 503 when Stripe isn't configured
 * (CLAUDE.md 7's optional-integration pattern) — never a fabricated payment.
 * The actual Payment row is written by the webhook receiver
 * (/api/v1/webhooks/stripe) once Stripe confirms the charge, not here.
 */

import { InvoiceStatus } from "@/generated/prisma/enums";
import { apiError } from "@/lib/api-auth";
import {
  authenticatePortalJobRequest,
  portalAuthErrorResponse,
} from "@/lib/client-portal/auth";
import { db } from "@/lib/db";
import { createPaymentIntent, StripeNotConfiguredError, StripeRequestError } from "@/lib/payments/stripe";

type Context = { params: Promise<{ invoiceId: string }> };

export async function POST(request: Request, context: Context) {
  const { invoiceId } = await context.params;

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return apiError(404, "not_found", `Invoice ${invoiceId} not found`);
  if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.PAID) {
    return apiError(409, "not_payable", `Invoice ${invoiceId} is ${invoice.status} and cannot take a payment.`);
  }

  try {
    await authenticatePortalJobRequest(request, invoice.jobId, "canMakePayments");

    const paidCents = invoice.payments.reduce((total, payment) => total + payment.amountCents, 0);
    const remainingCents = invoice.amountCents - paidCents;
    if (remainingCents <= 0) return apiError(409, "not_payable", `Invoice ${invoiceId} has no remaining balance.`);

    const intent = await createPaymentIntent({
      amountCents: remainingCents,
      invoiceId,
      organizationId: invoice.organizationId,
    });

    return Response.json({ data: { clientSecret: intent.clientSecret, amountCents: remainingCents } });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    if (error instanceof StripeNotConfiguredError) {
      return apiError(503, "not_configured", "Online payment is not enabled for this organization yet.");
    }
    if (error instanceof StripeRequestError) return apiError(502, "payment_provider_error", error.message);
    throw error;
  }
}
