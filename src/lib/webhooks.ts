/**
 * Webhook dispatcher — how the Jarvis agents react to events instead of polling
 * (CLAUDE.md 2.5).
 *
 * Every emission is persisted as a WebhookDelivery *before* any network call, so a
 * failed webhook is visible and retryable rather than silently dropped. That is the
 * same principle the QuickBooks sync log follows, and it matters most for the events
 * Duke reconciles against daily.
 *
 * Delivery is attempted inline and, on failure, left in the table with a
 * `nextAttemptAt` for `processDueDeliveries()` to retry. That function is the seam
 * for Inngest/Trigger.dev: once a queue account exists, a scheduled job calls it
 * instead of the interim cron endpoint. The persistence model does not change.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/** Domain events. Adding one here is the whole contract — subscribers filter on these. */
export const WEBHOOK_EVENT_TYPES = [
  "job.created",
  "job.status_changed",
  "estimate.sent_to_budget",
  "po.created",
  "po.approved",
  "bill.created",
  "bill.ready_for_payment",
  "bill.paid",
  /// Raised by Duke when a bank/card transaction cannot be matched to a job.
  "bill.unmatched_transaction",
  "invoice.created",
  "invoice.sent",
  "invoice.paid",
  "change_order.approved",
  "daily_log.created",
  "time_clock.out_of_bounds",
  "permit.milestone_reached",
  "selection.option_approved",
  "client.invited",
  "vendor.invited",
  "po.vendor_accepted",
  "bid.submitted",
  "bid.accepted",
  "lead.converted",
  "proposal.sent",
  "proposal.accepted",
  "proposal.declined",
  "submittal.review_requested",
  "submittal.reviewed",
  "warranty_claim.trade_accepted",
  "warranty_claim.client_accepted",
  "survey.response_requested",
  "survey.response_submitted",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(WEBHOOK_EVENT_TYPES);

export function isWebhookEventType(value: string): value is WebhookEventType {
  return EVENT_TYPE_SET.has(value);
}

/** A subscription matches on an exact event, a resource wildcard, or "*". */
export function subscriptionMatches(eventTypes: readonly string[], event: WebhookEventType): boolean {
  if (eventTypes.includes("*") || eventTypes.includes(event)) return true;
  const [resource] = event.split(".");
  return eventTypes.includes(`${resource}.*`);
}

export const SIGNATURE_HEADER = "x-wci-signature";
export const EVENT_HEADER = "x-wci-event";
export const DELIVERY_HEADER = "x-wci-delivery";
export const TIMESTAMP_HEADER = "x-wci-timestamp";

/**
 * Sign a payload. The timestamp is inside the signed string so a captured request
 * cannot be replayed later against a receiver that checks it.
 */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex")}`;
}

/** Constant-time signature check, for receivers implemented inside this codebase. */
export function verifySignature(secret: string, timestamp: string, body: string, signature: string): boolean {
  const expected = signPayload(secret, timestamp, body);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
}

/** Exponential backoff: 1m, 5m, 25m, 2h05m, then give up after MAX_ATTEMPTS. */
export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 60_000;

export function nextAttemptDelayMs(attempts: number): number {
  return BASE_DELAY_MS * Math.pow(5, Math.max(0, attempts - 1));
}

export interface EmitResult {
  readonly eventId: string;
  readonly deliveriesCreated: number;
}

/**
 * Emit a domain event to every matching active subscription.
 *
 * Never throws: a webhook failure must not roll back the business action that
 * caused it. Failures live in the delivery log instead.
 */
export async function emitEvent(
  organizationId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
): Promise<EmitResult> {
  const eventId = randomUUID();

  try {
    const subscriptions = await db.webhookSubscription.findMany({
      where: { organizationId, isActive: true },
    });

    const matching = subscriptions.filter((subscription) =>
      subscriptionMatches(subscription.eventTypes, eventType),
    );

    if (matching.length === 0) {
      return { eventId, deliveriesCreated: 0 };
    }

    const envelope = { id: eventId, type: eventType, createdAt: new Date().toISOString(), data: payload };

    const deliveries = await Promise.all(
      matching.map((subscription) =>
        db.webhookDelivery.create({
          data: {
            subscriptionId: subscription.id,
            eventType,
            eventId,
            payload: envelope as unknown as Prisma.InputJsonValue,
            nextAttemptAt: new Date(),
          },
        }),
      ),
    );

    // Attempt immediately, but never block the caller on the network.
    void Promise.all(deliveries.map((delivery) => attemptDelivery(delivery.id))).catch(() => undefined);

    return { eventId, deliveriesCreated: deliveries.length };
  } catch (error) {
    console.error(`Failed to emit ${eventType}:`, error);
    return { eventId, deliveriesCreated: 0 };
  }
}

/** Attempt one delivery, recording the outcome. Never throws. */
export async function attemptDelivery(deliveryId: string): Promise<boolean> {
  try {
    const delivery = await db.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { subscription: true },
    });

    if (!delivery || delivery.deliveredAt !== null) return true;

    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const attempts = delivery.attempts + 1;

    try {
      const response = await fetch(delivery.subscription.targetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [SIGNATURE_HEADER]: signPayload(delivery.subscription.secret, timestamp, body),
          [TIMESTAMP_HEADER]: timestamp,
          [EVENT_HEADER]: delivery.eventType,
          [DELIVERY_HEADER]: delivery.eventId,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      const succeeded = response.ok;
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts,
          lastAttemptAt: new Date(),
          lastStatusCode: response.status,
          deliveredAt: succeeded ? new Date() : null,
          nextAttemptAt:
            succeeded || attempts >= MAX_ATTEMPTS
              ? null
              : new Date(Date.now() + nextAttemptDelayMs(attempts)),
          lastError: succeeded ? null : `HTTP ${response.status}`,
        },
      });
      return succeeded;
    } catch (error) {
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts,
          lastAttemptAt: new Date(),
          lastError: error instanceof Error ? error.message : String(error),
          nextAttemptAt:
            attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + nextAttemptDelayMs(attempts)),
        },
      });
      return false;
    }
  } catch (error) {
    console.error(`Delivery ${deliveryId} failed to record:`, error);
    return false;
  }
}

/**
 * Retry every delivery that is due. This is the function a queue worker calls;
 * until Inngest/Trigger.dev is wired up it is driven by a scheduled request to
 * /api/v1/webhooks/process.
 */
export async function processDueDeliveries(limit = 50): Promise<{ attempted: number; succeeded: number }> {
  const due = await db.webhookDelivery.findMany({
    where: { deliveredAt: null, nextAttemptAt: { lte: new Date() }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results = await Promise.all(due.map((delivery) => attemptDelivery(delivery.id)));
  return { attempted: results.length, succeeded: results.filter(Boolean).length };
}
