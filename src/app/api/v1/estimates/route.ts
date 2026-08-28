/**
 * /api/v1/estimates — Neil's (estimator) surface, and the entry point to the budget.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createEstimateSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { createEstimate, JobNotFoundError, UnknownCostCodeError } from "@/lib/estimates/service";

export const GET = withApiAuth(["estimates:read"], async (request, auth) => {
  const jobId = new URL(request.url).searchParams.get("jobId");

  const estimates = await db.estimate.findMany({
    where: { organizationId: auth.organizationId, ...(jobId ? { jobId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json({ data: estimates });
});

export const POST = withApiAuth(["estimates:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createEstimateSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The estimate could not be created.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  try {
    const estimate = await createEstimate({ organizationId: auth.organizationId, ...input });
    return Response.json({ data: estimate }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    if (error instanceof UnknownCostCodeError) {
      return apiError(422, "unknown_cost_code", error.message, { unknown: error.unknownIds });
    }
    throw error;
  }
});
