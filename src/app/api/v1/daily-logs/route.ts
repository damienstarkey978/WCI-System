/** /api/v1/daily-logs — Heather's core surface: notes, media, auto-weather. */

import { actorFromApiKey } from "@/lib/actor";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { createDailyLogSchema, formatZodIssues, listDailyLogsQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import {
  createDailyLog,
  DailyLogAuthorRequiredError,
  JobNotFoundError,
  serializeDailyLog,
} from "@/lib/daily-logs/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["daily-logs:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = listDailyLogsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { jobId, limit, cursor, include } = parsed.data;
  const includeFiles = include === "files";

  const dailyLogs = await db.dailyLog.findMany({
    where: { organizationId: auth.organizationId, ...(jobId ? { jobId } : {}) },
    orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: includeFiles
      ? { files: { where: { deletedAt: null } } }
      : { _count: { select: { files: { where: { deletedAt: null } } } } },
  });

  const page = toCursorPage(dailyLogs, limit);
  return Response.json({
    data: page.data.map((row) => {
      const serialized = serializeDailyLog(row);
      if (includeFiles) return serialized;
      const { _count, ...rest } = serialized as typeof serialized & {
        _count?: { files: number };
      };
      return { ...rest, fileCount: _count?.files ?? 0 };
    }),
    pagination: page.pagination,
  });
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
    const dailyLog = await createDailyLog({
      organizationId: auth.organizationId,
      ...parsed.data,
      actor: actorFromApiKey(auth.apiKeyId),
    });
    return Response.json({ data: serializeDailyLog(dailyLog) }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(422, "unknown_job", error.message);
    }
    if (error instanceof DailyLogAuthorRequiredError) {
      return apiError(422, "author_required", error.message);
    }
    console.error("POST /api/v1/daily-logs failed:", error);
    return apiError(
      500,
      "daily_log_create_failed",
      error instanceof Error ? error.message : "The daily log could not be created.",
    );
  }
});
