/**
 * Job progress rollup for agents (Atlas / Heather): schedule completion, open todos,
 * and permit/inspection status — without requiring separate round-trips.
 */

import { db } from "@/lib/db";
import { ensureDefaultPermits } from "@/lib/permitting/service";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export interface JobProgressView {
  readonly jobId: string;
  readonly name: string;
  readonly status: string;
  readonly schedule: {
    readonly itemCount: number;
    readonly avgPercentComplete: number;
    readonly completedItemCount: number;
  };
  readonly todos: {
    readonly openCount: number;
    readonly inProgressCount: number;
    readonly doneCount: number;
  };
  readonly permits: {
    readonly tradeCount: number;
    readonly pulledCount: number;
    readonly inspectionCount: number;
    readonly inspectionsCompleted: number;
  };
}

export async function getJobProgress(organizationId: string, jobId: string): Promise<JobProgressView> {
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true, name: true, status: true },
  });
  if (!job) throw new JobNotFoundError(jobId);

  await ensureDefaultPermits(organizationId, jobId);

  const [scheduleItems, todos, permits] = await Promise.all([
    db.scheduleItem.findMany({
      where: { schedule: { jobId, organizationId } },
      select: { percentCompleteBasisPoints: true },
    }),
    db.todo.groupBy({
      by: ["status"],
      where: { jobId, organizationId },
      _count: { _all: true },
    }),
    db.jobPermit.findMany({
      where: { jobId, organizationId },
      select: {
        pulled: true,
        inspections: { select: { completedAt: true } },
      },
    }),
  ]);

  const itemCount = scheduleItems.length;
  const avgPercentComplete =
    itemCount === 0
      ? 0
      : Math.round(
          scheduleItems.reduce((sum, item) => sum + item.percentCompleteBasisPoints, 0) / itemCount / 100,
        );
  const completedItemCount = scheduleItems.filter((item) => item.percentCompleteBasisPoints >= 10_000).length;

  const todoCounts = { openCount: 0, inProgressCount: 0, doneCount: 0 };
  for (const row of todos) {
    if (row.status === "OPEN") todoCounts.openCount = row._count._all;
    else if (row.status === "IN_PROGRESS") todoCounts.inProgressCount = row._count._all;
    else if (row.status === "DONE") todoCounts.doneCount = row._count._all;
  }

  let inspectionCount = 0;
  let inspectionsCompleted = 0;
  let pulledCount = 0;
  for (const permit of permits) {
    if (permit.pulled) pulledCount += 1;
    for (const inspection of permit.inspections) {
      inspectionCount += 1;
      if (inspection.completedAt) inspectionsCompleted += 1;
    }
  }

  return {
    jobId: job.id,
    name: job.name,
    status: job.status,
    schedule: { itemCount, avgPercentComplete, completedItemCount },
    todos: todoCounts,
    permits: {
      tradeCount: permits.length,
      pulledCount,
      inspectionCount,
      inspectionsCompleted,
    },
  };
}
