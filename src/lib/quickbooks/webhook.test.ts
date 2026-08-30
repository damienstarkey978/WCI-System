import { createHmac } from "node:crypto";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  InvalidQuickBooksWebhookSignatureError,
  QuickBooksWebhooksNotConfiguredError,
  verifyQuickBooksWebhookSignature,
} from "@/lib/quickbooks/webhook";

function sign(verifierToken: string, payload: string): string {
  return createHmac("sha256", verifierToken).update(payload, "utf8").digest("base64");
}

describe("verifyQuickBooksWebhookSignature", () => {
  const verifierToken = "test-verifier-token";

  beforeEach(() => {
    vi.stubEnv("QBO_WEBHOOK_VERIFIER_TOKEN", verifierToken);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a correctly signed payload", () => {
    const payload = JSON.stringify({ eventNotifications: [] });
    const header = sign(verifierToken, payload);
    expect(() => verifyQuickBooksWebhookSignature(payload, header)).not.toThrow();
  });

  it("rejects a tampered payload", () => {
    const header = sign(verifierToken, "original");
    expect(() => verifyQuickBooksWebhookSignature("tampered", header)).toThrow(InvalidQuickBooksWebhookSignatureError);
  });

  it("rejects a signature computed with the wrong verifier token", () => {
    const payload = "payload";
    const header = sign("wrong-token", payload);
    expect(() => verifyQuickBooksWebhookSignature(payload, header)).toThrow(InvalidQuickBooksWebhookSignatureError);
  });

  it("rejects a missing header", () => {
    expect(() => verifyQuickBooksWebhookSignature("payload", null)).toThrow(InvalidQuickBooksWebhookSignatureError);
  });

  it("throws QuickBooksWebhooksNotConfiguredError with no verifier token set", () => {
    vi.unstubAllEnvs();
    expect(() => verifyQuickBooksWebhookSignature("payload", "abc")).toThrow(QuickBooksWebhooksNotConfiguredError);
  });
});
