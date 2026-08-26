/**
 * /api/v1/time-clock — clock in, and list entries.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { clockInSchema, formatZodIssues, listTimeClockQuerySchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import {
  clockIn,
  CostCodeNotFoundError,
  JobNotFoundError,
  JobNotOpenError,
  NoLaborRateError,
  UserAlreadyClockedInError,
} from "@/lib/time-clock/service";

export const GET = withApiAuth(["time-clock:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = listTimeClockQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { jobId, userId, approvalStatus, limit } = parsed.data;

  const entries = await db.timeClockEntry.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(userId ? { userId } : {}),
      ...(approvalStatus ? { approvalStatus } : {}),
    },
    orderBy: { clockInAt: "desc" },
    take: limit,
    include: { breaks: true },
  });

  return Response.json({ data: entries });
});

export const POST = withApiAuth(["time-clock:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = clockInSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Could not clock in.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  try {
    const entry = await clockIn({
      organizationId: auth.organizationId,
      userId: input.userId,
      jobId: input.jobId,
      costCodeId: input.costCodeId,
      gps: input.gps ?? undefined,
      overrideRateCents: input.overrideRateCents,
    });
    return Response.json({ data: entry }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof CostCodeNotFoundError) {
      return apiError(422, "not_found", error.message);
    }
    if (error instanceof JobNotOpenError) {
      return apiError(409, "job_not_open", error.message);
    }
    if (error instanceof NoLaborRateError) {
      return apiError(422, "no_labor_rate", error.message);
    }
    if (error instanceof UserAlreadyClockedInError) {
      return apiError(409, "already_clocked_in", error.message);
    }
    throw error;
  }
});
