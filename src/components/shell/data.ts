import { db } from "@/lib/db";
import { countUnreadNotifications, listNotificationsForUser } from "@/lib/notifications/service";

import type { SidebarJob } from "./JobSidebar";
import type { BellNotification } from "./TopNav";

/** Every job in the org, grouped for the sidebar exactly the way JobGroup models it. */
export async function sidebarJobsForOrg(organizationId: string): Promise<SidebarJob[]> {
  const jobs = await db.job.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { jobGroup: true },
  });

  return jobs.map((job) => ({
    id: job.id,
    name: job.name,
    prefix: job.prefix,
    status: job.status,
    groupName: job.jobGroup?.name ?? "General",
  }));
}

/** The Bell icon's data: a user's most recent in-app notifications, plus the unread count for the badge. */
export async function notificationBellDataForUser(
  organizationId: string,
  userId: string,
): Promise<{ notifications: BellNotification[]; unreadCount: number }> {
  const [notifications, unreadCount] = await Promise.all([
    listNotificationsForUser(organizationId, userId, 10),
    countUnreadNotifications(organizationId, userId),
  ]);

  return {
    notifications: notifications.map((n) => ({
      id: n.id,
      payload: n.payload as Record<string, unknown>,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  };
}
