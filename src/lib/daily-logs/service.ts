import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fetchWeatherForJob } from "@/lib/daily-logs/weather";
import { emitEvent } from "@/lib/webhooks";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export interface CreateDailyLogInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly authorUserId: string;
  readonly note: string;
  readonly title?: string | null;
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
}

export async function createDailyLog(input: CreateDailyLogInput) {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, latitude: true, longitude: true },
  });
  if (!job) throw new JobNotFoundError(input.jobId);

  // A weather-provider hiccup must never block creating the log — fetchWeatherForJob
  // already swallows its own failures and returns null.
  const weather = await fetchWeatherForJob(job);

  const dailyLog = await db.dailyLog.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      authorUserId: input.authorUserId,
      title: input.title?.trim() ? input.title.trim().slice(0, 200) : null,
      note: input.note,
      weather: (weather ?? undefined) as Prisma.InputJsonValue | undefined,
      clientVisible: input.clientVisible ?? true,
      subVisible: input.subVisible ?? true,
    },
  });

  await emitEvent(input.organizationId, "daily_log.created", {
    dailyLogId: dailyLog.id,
    jobId: dailyLog.jobId,
    authorUserId: dailyLog.authorUserId,
  });

  return dailyLog;
}

/** Adds the heart if the user has not given one, removes it if they have. Returns the new state. */
export async function toggleDailyLogLike(organizationId: string, dailyLogId: string, userId: string): Promise<{ liked: boolean }> {
  const log = await db.dailyLog.findFirst({ where: { id: dailyLogId, organizationId }, select: { id: true } });
  if (!log) throw new Error(`Daily log ${dailyLogId} not found`);

  const existing = await db.dailyLogLike.findUnique({ where: { dailyLogId_userId: { dailyLogId, userId } } });
  if (existing) {
    await db.dailyLogLike.delete({ where: { dailyLogId_userId: { dailyLogId, userId } } });
    return { liked: false };
  }
  await db.dailyLogLike.create({ data: { dailyLogId, userId } });
  return { liked: true };
}
