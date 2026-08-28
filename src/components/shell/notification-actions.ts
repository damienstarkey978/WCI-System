"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { markAllNotificationsRead, markNotificationRead, NotificationNotFoundError } from "@/lib/notifications/service";

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const notificationId = String(formData.get("notificationId") ?? "");

  try {
    await markNotificationRead(user.organizationId, notificationId);
  } catch (error) {
    if (error instanceof NotificationNotFoundError) return;
    throw error;
  }

  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireAppUser();
  await markAllNotificationsRead(user.organizationId, user.id);
  revalidatePath("/", "layout");
}
