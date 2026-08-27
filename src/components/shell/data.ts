import { db } from "@/lib/db";

import type { SidebarJob } from "./JobSidebar";

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
