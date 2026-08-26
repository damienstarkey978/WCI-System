/** /api/v1/schedule-items/{itemId} — update a schedule item's mutable fields. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateScheduleItemSchema } from "@/lib/api-schemas";
import { ScheduleItemNotFoundError, updateScheduleItem } from "@/lib/scheduling/service";

type Context = { params: Promise<{ itemId: string }> };

export const POST = withApiAuth<Context>(["schedule:write"], async (request, auth, context) => {
  const { itemId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = updateScheduleItemSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Could not update the schedule item.", formatZodIssues(parsed.error));
  }

  try {
    const item = await updateScheduleItem({ organizationId: auth.organizationId, itemId, ...parsed.data });
    return Response.json({ data: item });
  } catch (error) {
    if (error instanceof ScheduleItemNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
