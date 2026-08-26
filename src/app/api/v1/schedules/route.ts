/** /api/v1/schedules — create/list schedules. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createScheduleSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { createSchedule, JobNotFoundError } from "@/lib/scheduling/service";

export const GET = withApiAuth(["schedule:read"], async (request, auth) => {
  const jobId = new URL(request.url).searchParams.get("jobId");

  const schedules = await db.schedule.findMany({
    where: { organizationId: auth.organizationId, ...(jobId ? { jobId } : {}) },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ data: schedules });
});

export const POST = withApiAuth(["schedule:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createScheduleSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The schedule could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const schedule = await createSchedule({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: schedule }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(422, "unknown_job", error.message);
    }
    throw error;
  }
});
