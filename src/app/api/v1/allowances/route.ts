/** /api/v1/allowances — create/list Allowance budget placeholders. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createAllowanceSchema, formatZodIssues } from "@/lib/api-schemas";
import { createAllowance, CostCodeNotFoundError, JobNotFoundError } from "@/lib/selections/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["selections:read"], async (request, auth) => {
  const jobId = new URL(request.url).searchParams.get("jobId");

  const allowances = await db.allowance.findMany({
    where: { organizationId: auth.organizationId, ...(jobId ? { jobId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return Response.json({ data: allowances });
});

export const POST = withApiAuth(["selections:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createAllowanceSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The allowance could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const allowance = await createAllowance({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: allowance }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    if (error instanceof CostCodeNotFoundError) return apiError(422, "unknown_cost_code", error.message);
    throw error;
  }
});
