import { JobStatus, UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { countUnreadNotifications, listNotificationsForUser } from "@/lib/notifications/service";

import type { SidebarJob } from "./JobSidebar";
import type { BellNotification } from "./TopNav";

/**
 * Every job the given user can actually open, grouped for the sidebar exactly
 * the way JobGroup models it. ADMIN/PM/OFFICE see every job in the org (their
 * roles have org-wide visibility by design, see src/lib/job-access.ts);
 * FIELD only sees jobs they hold an explicit JobAccessGrant for, so the
 * sidebar never lists a job that clicking into would just deny.
 *
 * Excludes PRE_SALE jobs — a Job row exists in that status as soon as a
 * proposal is drafted for a Lead (src/lib/crm/lead-proposal.ts: "a Proposal
 * always belongs to a real Job"), before the client has accepted anything.
 * It only becomes a real job (JobStatus.OPEN) once its proposal is actually
 * accepted (src/lib/proposals/service.ts). The full /jobs list still shows
 * pre-sale jobs, with their own "Pre-sale" badge, for staff managing that
 * pipeline — this sidebar is the persistent nav on every page, and a Lead
 * someone is still drafting a proposal for isn't a job yet.
 */
export async function sidebarJobsForOrg(organizationId: string, user: { readonly id: string; readonly role: UserRole }): Promise<SidebarJob[]> {
  const jobs = await db.job.findMany({
    where: {
      organizationId,
      isTemplate: false,
      status: { not: JobStatus.PRE_SALE },
      ...(user.role === UserRole.FIELD ? { accessGrants: { some: { userId: user.id } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { jobGroup: true, clientAccess: { take: 1, include: { client: true } } },
  });

  return jobs.map((job) => ({
    id: job.id,
    name: job.name,
    prefix: job.prefix,
    status: job.status,
    groupName: job.jobGroup?.name ?? "General",
    clientName: job.clientAccess[0]?.client.name ?? null,
    address: [job.addressLine1, job.city].filter(Boolean).join(", ") || null,
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
