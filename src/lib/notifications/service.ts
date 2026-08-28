/**
 * Notifications. IN_APP is "delivered" the moment it exists — a viewer reads it
 * straight from this table, no transport step needed. EMAIL/SMS/PUSH need a
 * provider (SendGrid/Twilio/APNs/FCM, none configured yet) — rows for those
 * channels are still persisted so nothing is silently dropped, but deliveredAt
 * stays null until a real provider exists. Same optional-integration pattern as
 * Clerk, Anthropic, and the weather provider.
 */

import type { Prisma } from "@/generated/prisma/client";
import { NotificationChannel } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { isEmailConfigured } from "@/lib/env";

export class InvalidNotificationTargetError extends Error {
  constructor() {
    super("A notification needs exactly one of userId or externalEmail.");
    this.name = "InvalidNotificationTargetError";
  }
}

export class NotificationNotFoundError extends Error {
  constructor(notificationId: string) {
    super(`Notification ${notificationId} not found`);
    this.name = "NotificationNotFoundError";
  }
}

export interface CreateNotificationInput {
  readonly organizationId: string;
  readonly userId?: string | null;
  readonly externalEmail?: string | null;
  readonly channel: NotificationChannel;
  readonly payload: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput) {
  const hasUser = input.userId != null;
  const hasEmail = input.externalEmail != null;
  if (hasUser === hasEmail) {
    // Both set, or neither — same "exactly one actor" guard used elsewhere
    // (JobStatusEvent's actorUserId/actorApiKeyId, Payment's invoiceId/billId).
    throw new InvalidNotificationTargetError();
  }

  const isDeliveredImmediately = input.channel === NotificationChannel.IN_APP;
  // TODO: once an email/SMS/push provider is configured, attempt real delivery
  // here for those channels and set deliveredAt on success — see isEmailConfigured().
  void isEmailConfigured();

  return db.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      externalEmail: input.externalEmail ?? null,
      channel: input.channel,
      payload: input.payload as Prisma.InputJsonValue,
      deliveredAt: isDeliveredImmediately ? new Date() : null,
    },
  });
}

export async function markNotificationRead(organizationId: string, notificationId: string) {
  const notification = await db.notification.findFirst({ where: { id: notificationId, organizationId } });
  if (!notification) throw new NotificationNotFoundError(notificationId);
  return db.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
}

/** The Bell icon's feed: a user's own IN_APP notifications, most recent first. */
export async function listNotificationsForUser(organizationId: string, userId: string, limit = 20) {
  return db.notification.findMany({
    where: { organizationId, userId, channel: NotificationChannel.IN_APP },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function countUnreadNotifications(organizationId: string, userId: string) {
  return db.notification.count({
    where: { organizationId, userId, channel: NotificationChannel.IN_APP, readAt: null },
  });
}

export async function markAllNotificationsRead(organizationId: string, userId: string) {
  await db.notification.updateMany({
    where: { organizationId, userId, channel: NotificationChannel.IN_APP, readAt: null },
    data: { readAt: new Date() },
  });
}
