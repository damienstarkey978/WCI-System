/** /api/v1/daily-logs — Heather's core surface: notes, media, auto-weather. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createDailyLogSchema, formatZodIssues, listDailyLogsQuerySchema } from "@/lib/api-schemas";
import { createDailyLog, JobNotFoundError } from "@/lib/daily-logs/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["daily-logs:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = listDailyLogsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { jobId, limit } = parsed.data;

  const dailyLogs = await db.dailyLog.findMany({
    where: { organizationId: auth.organizationId, ...(jobId ? { jobId } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { files: true },
  });

  return Response.json({ data: dailyLogs });
});

export const POST = withApiAuth(["daily-logs:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createDailyLogSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The daily log could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const dailyLog = await createDailyLog({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: dailyLog }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(422, "unknown_job", error.message);
    }
    throw error;
  }
});
