import { describe, expect, it } from "vitest";

import {
  isWebhookEventType,
  MAX_ATTEMPTS,
  nextAttemptDelayMs,
  signPayload,
  subscriptionMatches,
  verifySignature,
  WEBHOOK_EVENT_TYPES,
} from "@/lib/webhooks";

describe("event types", () => {
  it("recognises known events", () => {
    expect(isWebhookEventType("bill.ready_for_payment")).toBe(true);
    expect(isWebhookEventType("po.approved")).toBe(true);
  });

  it("rejects invented events", () => {
    expect(isWebhookEventType("bill.exploded")).toBe(false);
    expect(isWebhookEventType("")).toBe(false);
  });

  it("includes the events the agents depend on", () => {
    // Duke's unmatched-transaction escalation and Heather's permit milestones are
    // load-bearing for their workflows.
    expect(WEBHOOK_EVENT_TYPES).toContain("bill.unmatched_transaction");
    expect(WEBHOOK_EVENT_TYPES).toContain("permit.milestone_reached");
  });
});

describe("subscription matching", () => {
  it("matches an exact event", () => {
    expect(subscriptionMatches(["po.approved"], "po.approved")).toBe(true);
  });

  it("does not match a different event", () => {
    expect(subscriptionMatches(["po.approved"], "bill.created")).toBe(false);
  });

  it("matches a resource wildcard", () => {
    expect(subscriptionMatches(["bill.*"], "bill.ready_for_payment")).toBe(true);
    expect(subscriptionMatches(["bill.*"], "po.approved")).toBe(false);
  });

  it("matches a global wildcard — Jarvis's orchestrator subscription", () => {
    expect(subscriptionMatches(["*"], "time_clock.out_of_bounds")).toBe(true);
  });

  it("matches nothing for an empty subscription list", () => {
    expect(subscriptionMatches([], "po.approved")).toBe(false);
  });
});

describe("payload signing", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ id: "evt_1", type: "po.approved" });
  const timestamp = "1700000000";

  it("produces a stable sha256 signature", () => {
    const signature = signPayload(secret, timestamp, body);
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signPayload(secret, timestamp, body)).toBe(signature);
  });

  it("verifies its own signature", () => {
    expect(verifySignature(secret, timestamp, body, signPayload(secret, timestamp, body))).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifySignature(secret, timestamp, body, signPayload("other", timestamp, body))).toBe(false);
  });

  it("rejects a tampered body", () => {
    const signature = signPayload(secret, timestamp, body);
    expect(verifySignature(secret, timestamp, `${body} `, signature)).toBe(false);
  });

  it("rejects a replayed timestamp — the timestamp is inside the signed string", () => {
    const signature = signPayload(secret, timestamp, body);
    expect(verifySignature(secret, "1700009999", body, signature)).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verifySignature(secret, timestamp, body, "nope")).toBe(false);
  });
});

describe("retry backoff", () => {
  it("escalates the delay with each attempt", () => {
    expect(nextAttemptDelayMs(1)).toBe(60_000); // 1m
    expect(nextAttemptDelayMs(2)).toBe(300_000); // 5m
    expect(nextAttemptDelayMs(3)).toBe(1_500_000); // 25m
  });

  it("is monotonic up to the attempt limit", () => {
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      expect(nextAttemptDelayMs(attempt + 1)).toBeGreaterThan(nextAttemptDelayMs(attempt));
    }
  });

  it("never returns a negative delay for a zeroth attempt", () => {
    expect(nextAttemptDelayMs(0)).toBeGreaterThan(0);
  });
});
