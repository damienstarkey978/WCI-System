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
