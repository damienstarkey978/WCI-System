/**
 * POST /api/v1/migration/daily-logs — bulk-import historical Daily Logs from
 * Buildertrend, one API call instead of Cowork typing each note into the form and
 * re-uploading each photo by hand. See src/lib/migration/service.ts for why this
 * exists as a separate surface from POST /api/v1/daily-logs.
 *
 * Per-item results (mirrors /api/staff/files/batch-import): a batch partially
 * succeeding is normal here — a bad cost code on item 40 of 100 shouldn't lose the
 * other 99, and the caller needs to know exactly which ones to retry.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, importDailyLogsSchema } from "@/lib/api-schemas";
import { importDailyLog } from "@/lib/migration/service";

export const POST = withApiAuth(["migration:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = importDailyLogsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Could not import daily logs.", formatZodIssues(parsed.error));
  }

  // Sequential, not Promise.all: a batch can run to 100 items and each import does
  // several queries — running them all concurrently would spike the connection pool
  // for no benefit, since this endpoint is a one-time backfill, not a latency-sensitive
  // live path.
  const results: Array<{ index: number; status: "success" | "error"; dailyLogId?: string; fileCount?: number; error?: string }> = [];
  for (const [index, input] of parsed.data.dailyLogs.entries()) {
    try {
      const dailyLog = await importDailyLog({ organizationId: auth.organizationId, ...input });
      results.push({ index, status: "success", dailyLogId: dailyLog.id, fileCount: dailyLog.files.length });
    } catch (error) {
      results.push({ index, status: "error", error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return Response.json({ data: results });
});
