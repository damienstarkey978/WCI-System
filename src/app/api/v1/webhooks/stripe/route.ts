/**
 * POST /api/v1/webhooks/stripe — Stripe → WCI OS. On payment_intent.succeeded,
 * records the Payment against the invoice named in the PaymentIntent's
 * metadata (set at creation in src/lib/payments/stripe.ts's
 * createPaymentIntent). Public route (src/proxy.ts) — the Stripe-Signature
 * header verified here is the real authentication.
 *
 * The payment method is recorded as STRIPE_CARD regardless of whether the
 * charge actually settled by card or ACH: distinguishing them would require
 * fetching the PaymentIntent's charges, which this minimal integration
 * doesn't do yet (CLAUDE.md 7).
 */

import { PaymentMethod } from "@/generated/prisma/enums";
import { apiError } from "@/lib/api-auth";
import { InvoiceNotFoundError, InvoiceVoidedError, recordPayment } from "@/lib/invoicing/service";
import { OverpaymentError } from "@/lib/invoicing/calc";
import { parseStripeEvent, verifyStripeWebhookSignature, InvalidWebhookSignatureError, StripeNotConfiguredError } from "@/lib/payments/stripe";

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    verifyStripeWebhookSignature(rawBody, request.headers.get("stripe-signature"));
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) return apiError(400, "invalid_signature", error.message);
    if (error instanceof StripeNotConfiguredError) return apiError(503, "not_configured", error.message);
    throw error;
  }

  const event = parseStripeEvent(rawBody);
  if (event.type !== "payment_intent.succeeded") {
    return Response.json({ received: true });
  }

  const { invoiceId, organizationId } = event.data.object.metadata ?? {};
  if (!invoiceId || !organizationId) {
    return apiError(422, "missing_metadata", "PaymentIntent is missing invoiceId/organizationId metadata.");
  }

  try {
    await recordPayment({
      organizationId,
      invoiceId,
      method: PaymentMethod.STRIPE_CARD,
      amountCents: event.data.object.amount,
      reference: event.data.object.id,
    });
  } catch (error) {
    // Acknowledge rather than let Stripe retry: none of these resolve on retry.
    // OverpaymentError in particular is Stripe's own at-least-once delivery
    // redelivering an event whose payment was already recorded.
    if (error instanceof InvoiceNotFoundError || error instanceof InvoiceVoidedError || error instanceof OverpaymentError) {
      return Response.json({ received: true, note: error.message });
    }
    throw error;
  }

  return Response.json({ received: true });
}
