/**
 * /api/v1/schedules/{scheduleId}/baseline — snapshot the current computed dates as
 * the baseline. Explicit action, never automatic (CLAUDE.md 3: "baseline snapshots").
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { snapshotBaseline, ScheduleNotFoundError } from "@/lib/scheduling/service";
import { MissingAnchorError, ScheduleCycleError, UnknownPredecessorError } from "@/lib/scheduling/cpm";

type Context = { params: Promise<{ scheduleId: string }> };

export const POST = withApiAuth<Context>(["schedule:write"], async (_request, auth, context) => {
  const { scheduleId } = await context.params;

  try {
    return Response.json({ data: await snapshotBaseline(auth.organizationId, scheduleId) });
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
