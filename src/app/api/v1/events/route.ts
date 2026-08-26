/**
 * /api/v1/events — agents raising their own domain events.
 *
 * This is what lets an agent report something WCI OS has no native module for yet:
 *
 *   - Duke raises `bill.unmatched_transaction` when an Amex/Regions charge can't be
 *     matched to a job. That replaces his current "compile a list and email Garry"
 *     with structured data anything can subscribe to.
 *   - Heather raises `permit.milestone_reached` from the permitting pipeline. Permit
 *     Rockstar, JAX EPICS and Simplifile stay external; WCI OS is just the system of
 *     record those milestones get logged against.
 *
 * Only known event types are accepted — an agent inventing event names would produce
 * events nothing is subscribed to, which looks like success and delivers nothing.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { emitEventSchema, formatZodIssues } from "@/lib/api-schemas";
import { emitEvent, isWebhookEventType, WEBHOOK_EVENT_TYPES } from "@/lib/webhooks";

export const POST = withApiAuth(["events:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = emitEventSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid event.", formatZodIssues(parsed.error));
  }
  const { eventType, data } = parsed.data;

  if (!isWebhookEventType(eventType)) {
    return apiError(422, "unknown_event_type", `Unknown event type "${eventType}".`, {
      availableEventTypes: WEBHOOK_EVENT_TYPES,
    });
  }

  const result = await emitEvent(auth.organizationId, eventType, {
    ...data,
    // Stamped server-side so a subscriber can always tell which agent raised it.
    raisedBy: auth.name,
    raisedByAgent: auth.agentKind,
  });

  return Response.json({ data: { eventId: result.eventId, deliveriesCreated: result.deliveriesCreated } }, {
    status: 202,
  });
});
