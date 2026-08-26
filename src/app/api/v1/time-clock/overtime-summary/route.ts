/**
 * /api/v1/time-clock/overtime-summary — weekly OT for one worker across every job
 * and cost code they touched that week (overtime is a property of the worker's
 * week, not of any one job — see src/lib/time-clock/overtime.ts).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, weeklyOvertimeQuerySchema } from "@/lib/api-schemas";
import { weeklyOvertimeSummary } from "@/lib/time-clock/service";

export const GET = withApiAuth(["time-clock:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = weeklyOvertimeQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }

  const summary = await weeklyOvertimeSummary({
    organizationId: auth.organizationId,
    userId: parsed.data.userId,
    weekStart: parsed.data.weekStart,
  });

  return Response.json({ data: summary });
});
