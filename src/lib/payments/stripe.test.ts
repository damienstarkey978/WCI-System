import { createHmac } from "node:crypto";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { InvalidWebhookSignatureError, StripeNotConfiguredError, verifyStripeWebhookSignature } from "@/lib/payments/stripe";

function sign(secret: string, timestamp: string, payload: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}

describe("verifyStripeWebhookSignature", () => {
  const secret = "whsec_test_secret";

  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a correctly signed payload", () => {
    const payload = JSON.stringify({ type: "payment_intent.succeeded" });
    const timestamp = "1700000000";
    const header = `t=${timestamp},v1=${sign(secret, timestamp, payload)}`;
    expect(() => verifyStripeWebhookSignature(payload, header)).not.toThrow();
  });

  it("rejects a tampered payload", () => {
    const timestamp = "1700000000";
    const header = `t=${timestamp},v1=${sign(secret, timestamp, "original")}`;
    expect(() => verifyStripeWebhookSignature("tampered", header)).toThrow(InvalidWebhookSignatureError);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const payload = "payload";
    const timestamp = "1700000000";
    const header = `t=${timestamp},v1=${sign("wrong_secret", timestamp, payload)}`;
    expect(() => verifyStripeWebhookSignature(payload, header)).toThrow(InvalidWebhookSignatureError);
  });

  it("rejects a missing header", () => {
    expect(() => verifyStripeWebhookSignature("payload", null)).toThrow(InvalidWebhookSignatureError);
  });

  it("rejects a malformed header", () => {
    expect(() => verifyStripeWebhookSignature("payload", "not-a-valid-header")).toThrow(InvalidWebhookSignatureError);
  });

  it("throws StripeNotConfiguredError with no webhook secret set", () => {
    vi.unstubAllEnvs();
    expect(() => verifyStripeWebhookSignature("payload", "t=1,v1=abc")).toThrow(StripeNotConfiguredError);
  });
});
