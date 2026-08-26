/**
 * /api/v1/schedules/{scheduleId} — a schedule with every item's dates and
 * critical-path status freshly computed (never stored — see src/lib/scheduling/cpm.ts).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { getComputedSchedule, ScheduleNotFoundError } from "@/lib/scheduling/service";
import { MissingAnchorError, ScheduleCycleError, UnknownPredecessorError } from "@/lib/scheduling/cpm";

type Context = { params: Promise<{ scheduleId: string }> };

export const GET = withApiAuth<Context>(["schedule:read"], async (_request, auth, context) => {
  const { scheduleId } = await context.params;

  try {
    return Response.json({ data: await getComputedSchedule(auth.organizationId, scheduleId) });
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof MissingAnchorError || error instanceof UnknownPredecessorError) {
      return apiError(422, "invalid_schedule", error.message);
    }
    if (error instanceof ScheduleCycleError) {
      return apiError(409, "dependency_cycle", error.message);
    }
    throw error;
  }
});
