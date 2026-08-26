/** /api/v1/time-clock/{entryId}/reject — mirror of approve, see that route's comment. */

import { z } from "zod";

import { UserRole } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { EntryNotFoundError, InsufficientRoleError, rejectEntry } from "@/lib/time-clock/service";
import { ClockNotClosedError } from "@/lib/time-clock/hours";

const rejectRequestSchema = z.object({ approverUserId: z.string().cuid() });

type Context = { params: Promise<{ entryId: string }> };

export const POST = withApiAuth<Context>(["time-clock:write"], async (request, auth, context) => {
  const { entryId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = rejectRequestSchema.safeParse(payload);
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
    const entry = await rejectEntry({
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
