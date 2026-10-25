import Link from "next/link";

import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";

import { JobsGrid } from "./jobs-grid";

// Reads live data on every request — never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function JobsIndexPage() {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  // The index lists every non-template job, pre-sale included (the sidebar hides
  // PRE_SALE on purpose; see sidebarJobsForOrg). FIELD users only see granted jobs.
  const [jobs, sidebarJobs, bell] = await Promise.all([
    db.job.findMany({
      where: {
        organizationId: user.organizationId,
        isTemplate: false,
        ...(user.role === UserRole.FIELD ? { accessGrants: { some: { userId: user.id } } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { jobGroup: true },
    }),
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
  ]);

  const rows = jobs.map((job) => ({
    id: job.id,
    name: job.name,
    prefix: job.prefix,
    status: job.status,
    groupName: job.jobGroup?.name ?? "General",
    address: [job.addressLine1, job.city, job.state].filter(Boolean).join(", ") || null,
    contractType: job.contractType,
    projectedStart: job.projectedStart ? job.projectedStart.toISOString() : null,
    projectedEnd: job.projectedEnd ? job.projectedEnd.toISOString() : null,
  }));

  return (
    <AppShell jobs={sidebarJobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Jobs</h1>
          <Link
            href="/jobs/new"
            className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
            style={{ background: "var(--bt-primary)" }}
          >
            + New job
          </Link>
        </div>

        <JobsGrid rows={rows} />
      </div>
    </AppShell>
  );
}
