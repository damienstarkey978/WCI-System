/**
 * POST /api/v1/migration/schedule-items — bulk-import historical Schedule Items
 * from Buildertrend. Ensures each job has a Schedule, then creates items with
 * historical start/duration/progress. Idempotent on (job, title, manualStartDate).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, importScheduleItemsSchema } from "@/lib/api-schemas";
import { importScheduleItem } from "@/lib/migration/service";

export const POST = withApiAuth(["migration:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = importScheduleItemsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Could not import schedule items.", formatZodIssues(parsed.error));
  }

  const results: Array<{
    index: number;
    status: "success" | "already_exists" | "error";
    scheduleItemId?: string;
    error?: string;
  }> = [];
  for (const [index, input] of parsed.data.scheduleItems.entries()) {
    try {
      const { record, created } = await importScheduleItem({ organizationId: auth.organizationId, ...input });
      results.push({
        index,
        status: created ? "success" : "already_exists",
        scheduleItemId: record.id,
      });
    } catch (error) {
      results.push({ index, status: "error", error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return Response.json({ data: results });
});
