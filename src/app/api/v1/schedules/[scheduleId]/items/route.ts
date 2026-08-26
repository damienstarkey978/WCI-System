/** /api/v1/schedules/{scheduleId}/items — add a schedule item. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createScheduleItemSchema, formatZodIssues } from "@/lib/api-schemas";
import { addScheduleItem, ScheduleNotFoundError } from "@/lib/scheduling/service";

type Context = { params: Promise<{ scheduleId: string }> };

export const POST = withApiAuth<Context>(["schedule:write"], async (request, auth, context) => {
  const { scheduleId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createScheduleItemSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The schedule item could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const item = await addScheduleItem({ organizationId: auth.organizationId, scheduleId, ...parsed.data });
    return Response.json({ data: item }, { status: 201 });
  } catch (error) {
    if (error instanceof ScheduleNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
