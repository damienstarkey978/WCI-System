/**
 * Database wiring for the AI weekly client-update summary. Keeps src/lib/ai/weekly-
 * summary-assistant.ts free of Prisma so its Claude-calling logic stays
 * unit-testable with a fake client — same split as every other AI module here.
 *
 * This is the one place that decides what "client-visible activity" means, and it
 * is the load-bearing safety boundary for the whole feature: only DailyLogs and
 * ScheduleItems already flagged clientVisible are read, and nothing budget/cost-
 * shaped is queried at all — not filtered out after the fact, never fetched in the
 * first place. See CLAUDE.md's Phase 8 deviations entry.
 */

import { db } from "@/lib/db";
import { generateWeeklySummary } from "@/lib/ai/weekly-summary-assistant";
import { getComputedSchedule } from "@/lib/scheduling/service";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface CreateWeeklySummaryInput {
  readonly organizationId: string;
  readonly jobId: string;
  /** Defaults to seven days ago. */
  readonly periodStart?: Date;
  /** Defaults to now. */
  readonly periodEnd?: Date;
}

async function buildClientSafeActivityText(organizationId: string, jobId: string, periodStart: Date, periodEnd: Date): Promise<string> {
  const dailyLogs = await db.dailyLog.findMany({
    where: { organizationId, jobId, clientVisible: true, createdAt: { gte: periodStart, lte: periodEnd } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, note: true },
  });

  const schedule = await db.schedule.findFirst({ where: { organizationId, jobId }, select: { id: true } });
  const scheduleLines: string[] = [];
  if (schedule) {
    const computed = await getComputedSchedule(organizationId, schedule.id);
    for (const item of computed.items) {
      if (!item.clientVisible) continue;
      const overlapsPeriod = item.startDate <= periodEnd && item.endDate >= periodStart;
      if (!overlapsPeriod) continue;
      scheduleLines.push(
        `- Schedule: "${item.title}" (${item.startDate.toISOString().slice(0, 10)} to ${item.endDate.toISOString().slice(0, 10)}, ${item.confirmationStatus.toLowerCase()})`,
      );
    }
  }

  const dailyLogLines = dailyLogs.map((log) => `- Site log ${log.createdAt.toISOString().slice(0, 10)}: ${log.note}`);

  return [...dailyLogLines, ...scheduleLines].join("\n");
}

export interface CreateWeeklySummaryResult {
  readonly id: string;
  readonly jobId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly headline: string;
  readonly body: string;
  readonly highlights: readonly string[];
  readonly createdAt: Date;
}

export async function createWeeklySummary(input: CreateWeeklySummaryInput): Promise<CreateWeeklySummaryResult> {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, name: true },
  });
  if (!job) {
    throw new JobNotFoundError(input.jobId);
  }

  const periodEnd = input.periodEnd ?? new Date();
  const periodStart = input.periodStart ?? new Date(periodEnd.getTime() - ONE_WEEK_MS);

  const activityText = await buildClientSafeActivityText(input.organizationId, job.id, periodStart, periodEnd);

  const draft = await generateWeeklySummary({ jobName: job.name, periodStart, periodEnd, activityText });

  return db.clientUpdateSummary.create({
    data: {
      organizationId: input.organizationId,
      jobId: job.id,
      periodStart,
      periodEnd,
      headline: draft.headline,
      body: draft.body,
      highlights: draft.highlights,
    },
  });
}

export interface ListWeeklySummariesInput {
  readonly organizationId: string;
  readonly jobId?: string;
}

export async function listWeeklySummaries(input: ListWeeklySummariesInput) {
  return db.clientUpdateSummary.findMany({
    where: { organizationId: input.organizationId, ...(input.jobId ? { jobId: input.jobId } : {}) },
    orderBy: { periodEnd: "desc" },
    take: 100,
  });
}
