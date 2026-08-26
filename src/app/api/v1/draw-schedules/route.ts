/**
 * /api/v1/draw-schedules — percentage-of-contract draw schedules.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createDrawScheduleSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { createDrawSchedule, DrawScheduleOverallocatedError, JobNotFoundError } from "@/lib/invoicing/service";

export const GET = withApiAuth(["invoices:read"], async (request, auth) => {
  const jobId = new URL(request.url).searchParams.get("jobId");

  const drawSchedules = await db.drawSchedule.findMany({
    where: { organizationId: auth.organizationId, ...(jobId ? { jobId } : {}) },
    orderBy: { createdAt: "desc" },
    include: { draws: { orderBy: { sortOrder: "asc" }, include: { invoice: true } } },
  });

  return Response.json({ data: drawSchedules });
});

export const POST = withApiAuth(["invoices:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createDrawScheduleSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The draw schedule could not be created.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  try {
    const drawSchedule = await createDrawSchedule({ organizationId: auth.organizationId, ...input });
    return Response.json({ data: drawSchedule }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(422, "unknown_job", error.message);
    }
    if (error instanceof DrawScheduleOverallocatedError) {
      return apiError(422, "overallocated", error.message);
    }
    throw error;
  }
});
