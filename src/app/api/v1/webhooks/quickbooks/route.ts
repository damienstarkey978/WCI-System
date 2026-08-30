/**
 * POST /api/v1/webhooks/quickbooks — QuickBooks -> WCI OS. Fires on any change in the
 * connected QBO company; src/lib/quickbooks/webhook.ts filters that down to Payment
 * entities and reconciles them against Invoices we pushed (CLAUDE.md 2.3, "Invoice
 * Payments ... QBO -> WCI"). Public route (src/proxy.ts) — the intuit-signature header
 * verified here is the real authentication, same shape as the Stripe webhook receiver.
 */

import { apiError } from "@/lib/api-auth";
import {
  InvalidQuickBooksWebhookSignatureError,
  processQuickBooksWebhookPayload,
  QuickBooksWebhooksNotConfiguredError,
  verifyQuickBooksWebhookSignature,
} from "@/lib/quickbooks/webhook";

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    verifyQuickBooksWebhookSignature(rawBody, request.headers.get("intuit-signature"));
  } catch (error) {
    if (error instanceof InvalidQuickBooksWebhookSignatureError) return apiError(400, "invalid_signature", error.message);
    if (error instanceof QuickBooksWebhooksNotConfiguredError) return apiError(503, "not_configured", error.message);
    throw error;
  }

  // Acknowledge before processing completes: Intuit only cares that we received it (and
  // retries on non-2xx), and per-entity failures are already captured in QboSyncLog for
  // retry rather than surfaced as a webhook-level failure.
  await processQuickBooksWebhookPayload(rawBody);

  return Response.json({ received: true });
}
