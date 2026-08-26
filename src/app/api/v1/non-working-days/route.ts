/** /api/v1/non-working-days — the org-wide holiday/shutdown calendar the CPM engine skips. */

import { Prisma } from "@/generated/prisma/client";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { createNonWorkingDaySchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";

export const GET = withApiAuth(["schedule:read"], async (_request, auth) => {
  const days = await db.nonWorkingDay.findMany({
    where: { organizationId: auth.organizationId },
    orderBy: { date: "asc" },
  });
  return Response.json({ data: days });
});

export const POST = withApiAuth(["schedule:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createNonWorkingDaySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid non-working day.", formatZodIssues(parsed.error));
  }

  try {
    const day = await db.nonWorkingDay.create({
      data: { organizationId: auth.organizationId, date: parsed.data.date, reason: parsed.data.reason ?? null },
    });
    return Response.json({ data: day }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(409, "duplicate_date", "That date is already marked non-working.");
    }
    throw error;
  }
});
