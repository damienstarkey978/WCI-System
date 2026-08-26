/**
 * /api/v1/time-clock/bulk-clock-in — supervisor bulk clock-in.
 *
 * Human-role-gated (ADMIN/PM), not scope-gated by a special API key scope — this
 * models "a supervisor clocking their crew in," so the caller must identify which
 * human is doing it and that human's role is checked, same as the admin UI would.
 */

import { z } from "zod";

import { UserRole } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { bulkClockInSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { bulkClockIn, InsufficientRoleError } from "@/lib/time-clock/service";

const bulkClockInRequestSchema = bulkClockInSchema.extend({ supervisorUserId: z.string().cuid() });

export const POST = withApiAuth(["time-clock:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = bulkClockInRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Could not bulk clock in.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  const supervisor = await db.user.findFirst({
    where: { id: input.supervisorUserId, organizationId: auth.organizationId },
    select: { role: true },
  });
  if (!supervisor) {
    return apiError(422, "unknown_supervisor", `No user ${input.supervisorUserId} in this organization.`);
  }

  try {
    const results = await bulkClockIn({
      organizationId: auth.organizationId,
      supervisorUserId: input.supervisorUserId,
      supervisorRole: supervisor.role as UserRole,
      jobId: input.jobId,
      costCodeId: input.costCodeId,
      userIds: input.userIds,
      gps: input.gps ?? undefined,
    });
    return Response.json({ data: results });
  } catch (error) {
    if (error instanceof InsufficientRoleError) {
      return apiError(403, "insufficient_role", error.message);
    }
    throw error;
  }
});
