/**
 * Stripe integration for client-portal invoice payments (CLAUDE.md 2.3, 3).
 * Optional integration, same pattern as weather/Anthropic (src/lib/env.ts):
 * without STRIPE_SECRET_KEY, payment endpoints return a clear "not
 * configured" error rather than the app failing or fabricating a payment.
 *
 * Talks to Stripe's REST API directly via fetch rather than the `stripe` SDK
 * — the surface used here (create a PaymentIntent, verify a webhook
 * signature) is small enough that a dependency isn't worth it, consistent
 * with src/lib/daily-logs/weather.ts.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { isStripeConfigured, stripeSecretKey, stripeWebhookSecret } from "@/lib/env";
import type { Cents } from "@/lib/money";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured (STRIPE_SECRET_KEY is unset).");
    this.name = "StripeNotConfiguredError";
  }
}

export class StripeRequestError extends Error {
  constructor(status: number, body: string) {
    super(`Stripe request failed (${status}): ${body}`);
    this.name = "StripeRequestError";
  }
}

export interface CreatePaymentIntentInput {
  readonly amountCents: Cents;
  readonly invoiceId: string;
  readonly organizationId: string;
}

export interface StripePaymentIntent {
  readonly id: string;
  readonly clientSecret: string;
  readonly status: string;
}

/** Create a PaymentIntent for an invoice. Throws StripeNotConfiguredError if unconfigured. */
export async function createPaymentIntent(input: CreatePaymentIntentInput): Promise<StripePaymentIntent> {
  if (!isStripeConfigured()) throw new StripeNotConfiguredError();

  const body = new URLSearchParams({
    amount: String(input.amountCents),
    currency: "usd",
    "automatic_payment_methods[enabled]": "true",
    "metadata[invoiceId]": input.invoiceId,
    "metadata[organizationId]": input.organizationId,
  });

  const response = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${stripeSecretKey()}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  const text = await response.text();
  if (!response.ok) throw new StripeRequestError(response.status, text);

  const data = JSON.parse(text) as { id: string; client_secret: string; status: string };
  return { id: data.id, clientSecret: data.client_secret, status: data.status };
}

export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super("Invalid Stripe webhook signature.");
    this.name = "InvalidWebhookSignatureError";
  }
}

/**
 * Verify a Stripe webhook per their signing scheme: the `Stripe-Signature`
 * header is `t=<timestamp>,v1=<hex hmac>`, computed over `${t}.${rawBody}`
 * with the webhook signing secret. Same HMAC-SHA256-and-timingSafeEqual shape
 * as the outbound webhook signer in src/lib/webhooks.ts, applied to a
 * verification instead of a signing.
 */
export function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string | null): void {
  const secret = stripeWebhookSecret();
  if (!secret) throw new StripeNotConfiguredError();
  if (!signatureHeader) throw new InvalidWebhookSignatureError();

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new InvalidWebhookSignatureError();

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new InvalidWebhookSignatureError();
  }
}

export interface StripePaymentIntentSucceededEvent {
  readonly type: string;
  readonly data: {
    readonly object: {
      readonly id: string;
      readonly amount: number;
      readonly metadata?: { readonly invoiceId?: string; readonly organizationId?: string };
    };
  };
}

export function parseStripeEvent(rawBody: string): StripePaymentIntentSucceededEvent {
  return JSON.parse(rawBody) as StripePaymentIntentSucceededEvent;
}
