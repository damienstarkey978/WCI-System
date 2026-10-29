/**
 * POST /api/v1/migration/schedule-flags — set Schedule.isOnline / isDraft from
 * Buildertrend calendarOffline without requiring schedule items (empty offline
 * calendars still need the Online toggle to match BT).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, importScheduleFlagsSchema } from "@/lib/api-schemas";
import { importScheduleFlags } from "@/lib/migration/service";
import { z } from "zod";

const batchSchema = z.object({
  schedules: z.array(importScheduleFlagsSchema).min(1).max(100),
});

export const POST = withApiAuth(["migration:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = batchSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(
      422,
      "validation_failed",
      "Could not import schedule flags.",
      formatZodIssues(parsed.error),
    );
  }

  const results: Array<{
    index: number;
    status: "success" | "already_exists" | "updated" | "error";
    scheduleId?: string;
    error?: string;
  }> = [];

  for (const [index, input] of parsed.data.schedules.entries()) {
    try {
      const { record, created, updated } = await importScheduleFlags({
        organizationId: auth.organizationId,
        ...input,
      });
      results.push({
        index,
        status: created ? "success" : updated ? "updated" : "already_exists",
        scheduleId: record.id,
      });
    } catch (error) {
      results.push({
        index,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return Response.json({ data: results });
});
