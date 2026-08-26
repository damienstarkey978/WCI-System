/**
 * /api/v1/time-clock/{entryId}/approve
 *
 * Role-gated to ADMIN/PM (supervisorUserId identifies who is approving, checked
 * against their real role — same pattern as bulk clock-in). Approval is what moves
 * this entry's cost into the funnel's committed cost (src/lib/budget/service.ts).
 */

import { z } from "zod";

import { UserRole } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { approveEntry, EntryNotFoundError, InsufficientRoleError } from "@/lib/time-clock/service";
import { ClockNotClosedError } from "@/lib/time-clock/hours";

const approveRequestSchema = z.object({ approverUserId: z.string().cuid() });

type Context = { params: Promise<{ entryId: string }> };

export const POST = withApiAuth<Context>(["time-clock:write"], async (request, auth, context) => {
  const { entryId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = approveRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "approverUserId is required.");
  }

  const approver = await db.user.findFirst({
    where: { id: parsed.data.approverUserId, organizationId: auth.organizationId },
    select: { role: true },
  });
  if (!approver) {
    return apiError(422, "unknown_approver", `No user ${parsed.data.approverUserId} in this organization.`);
  }

  try {
    const entry = await approveEntry({
      organizationId: auth.organizationId,
      entryId,
      approverUserId: parsed.data.approverUserId,
      approverRole: approver.role as UserRole,
    });
    return Response.json({ data: entry });
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof ClockNotClosedError) {
      return apiError(409, "not_clocked_out", error.message);
    }
    if (error instanceof InsufficientRoleError) {
      return apiError(403, "insufficient_role", error.message);
    }
    throw error;
  }
});
