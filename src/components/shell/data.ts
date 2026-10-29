import { cache } from "react";

import { JobStatus, UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { countUnreadNotifications, listNotificationsForUser } from "@/lib/notifications/service";

import type { SidebarJob } from "./JobSidebar";
import type { BellNotification } from "./TopNav";

/** Fields the job rail / TopNav jump list actually render — never the full Job row. */
const SIDEBAR_JOB_SELECT = {
  id: true,
  name: true,
  prefix: true,
  status: true,
  addressLine1: true,
  city: true,
  state: true,
  postalCode: true,
  qboCustomerId: true,
  jobGroup: { select: { name: true } },
  clientAccess: { take: 1, select: { client: { select: { name: true } } } },
} as const;

function toSidebarJob(job: {
  id: string;
  name: string;
  prefix: string | null;
  status: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  qboCustomerId: string | null;
  jobGroup: { name: string } | null;
  clientAccess: { client: { name: string } }[];
}): SidebarJob {
  const cityLine = [job.city, [job.state, job.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  return {
    id: job.id,
    name: job.name,
    prefix: job.prefix,
    status: job.status,
    groupName: job.jobGroup?.name ?? "General",
    clientName: job.clientAccess[0]?.client.name ?? null,
    addressLine1: job.addressLine1,
    cityLine,
    /** Compact single-line fallback for jump lists that still want one string. */
    address: [job.addressLine1, job.city].filter(Boolean).join(", ") || null,
    qboLinked: job.qboCustomerId !== null,
  };
}

/**
 * Every job the given user can actually open, grouped for the sidebar exactly
 * the way JobGroup models it. ADMIN/PM/OFFICE see every job in the org (their
 * roles have org-wide visibility by design, see src/lib/job-access.ts);
 * FIELD only sees jobs they hold an explicit JobAccessGrant for, so the
 * sidebar never lists a job that clicking into would just deny.
 *
 * Excludes PRE_SALE jobs. A Lead's proposal/estimate stay scoped to just the
 * Lead (no Job row at all — src/lib/crm/lead-proposal.ts, src/lib/proposals/
 * service.ts) until the client accepts, at which point the Job is created
 * directly as OPEN. PRE_SALE is only ever used for a Job created directly
 * (not via a Lead), so this filter is a belt-and-suspenders guard against
 * that path, not the primary mechanism keeping unaccepted leads off this
 * list. The full /jobs list still shows pre-sale jobs, with their own
 * "Pre-sale" badge, for staff managing that pipeline.
 *
 * Request-cached: StaffShell and /jobs both need this list; without cache()
 * every navigation paid for it twice (and AppShell's template fetch on top).
 */
export const sidebarJobsForOrg = cache(async function sidebarJobsForOrg(
  organizationId: string,
  user: { readonly id: string; readonly role: UserRole },
): Promise<SidebarJob[]> {
  const jobs = await db.job.findMany({
    where: {
      organizationId,
      isTemplate: false,
      status: { not: JobStatus.PRE_SALE },
      ...(user.role === UserRole.FIELD ? { accessGrants: { some: { userId: user.id } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: SIDEBAR_JOB_SELECT,
  });

  return jobs.map(toSidebarJob);
});

/** The job sidebar's "Templates" tab (JobSidebar.tsx) — Job.isTemplate rows, same shape as the real-job list above. */
export const sidebarTemplateJobsForOrg = cache(async function sidebarTemplateJobsForOrg(
  organizationId: string,
): Promise<SidebarJob[]> {
  const jobs = await db.job.findMany({
    where: { organizationId, isTemplate: true },
    orderBy: { createdAt: "desc" },
    select: SIDEBAR_JOB_SELECT,
  });

  return jobs.map(toSidebarJob);
});

/** Org display name for the BT company strip — cached so AppShell doesn't re-hit on nested renders. */
export const organizationNameForShell = cache(async function organizationNameForShell(
  organizationId: string,
): Promise<string> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  return organization?.name ?? "World Construction Inc.";
});

/** The Bell icon's data: a user's most recent in-app notifications, plus the unread count for the badge. */
export const notificationBellDataForUser = cache(async function notificationBellDataForUser(
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
});
