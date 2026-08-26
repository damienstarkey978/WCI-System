/**
 * /api/v1/webhooks — subscription management.
 *
 * This is what lets the Jarvis agents react to events instead of polling
 * (CLAUDE.md 2.5).
 */

import { randomBytes } from "node:crypto";

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createWebhookSubscriptionSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { isWebhookEventType, WEBHOOK_EVENT_TYPES } from "@/lib/webhooks";

export const GET = withApiAuth(["webhooks:read"], async (_request, auth) => {
  const subscriptions = await db.webhookSubscription.findMany({
    where: { organizationId: auth.organizationId },
    orderBy: { createdAt: "desc" },
    // The secret is write-once: it is returned at creation and never again.
    select: {
      id: true,
      name: true,
      targetUrl: true,
      eventTypes: true,
      isActive: true,
      createdAt: true,
      _count: { select: { deliveries: true } },
    },
  });

  return Response.json({ data: subscriptions, meta: { availableEventTypes: WEBHOOK_EVENT_TYPES } });
});

export const POST = withApiAuth(["webhooks:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createWebhookSubscriptionSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The subscription could not be created.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  // Wildcards are allowed; anything else must be a real event, or a subscriber would
  // silently receive nothing because of a typo.
  const unknown = input.eventTypes.filter(
    (eventType) => eventType !== "*" && !eventType.endsWith(".*") && !isWebhookEventType(eventType),
  );
  if (unknown.length > 0) {
    return apiError(422, "unknown_event_type", `Unknown event type(s): ${unknown.join(", ")}`, {
      unknown,
      availableEventTypes: WEBHOOK_EVENT_TYPES,
    });
  }

  const secret = randomBytes(32).toString("base64url");

  const subscription = await db.webhookSubscription.create({
    data: {
      organizationId: auth.organizationId,
      name: input.name,
      targetUrl: input.targetUrl,
      eventTypes: input.eventTypes,
      secret,
    },
  });

  return Response.json(
    {
      data: {
        id: subscription.id,
        name: subscription.name,
        targetUrl: subscription.targetUrl,
        eventTypes: subscription.eventTypes,
        isActive: subscription.isActive,
        createdAt: subscription.createdAt,
        // Shown exactly once. Payloads are signed with it as
        // sha256(timestamp + "." + body), sent in the x-wci-signature header.
        secret,
      },
    },
    { status: 201 },
  );
});
