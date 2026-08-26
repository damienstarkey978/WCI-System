/** /api/v1/selections — create/list Selections (with their Options). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createSelectionSchema, formatZodIssues } from "@/lib/api-schemas";
import { AllowanceNotFoundError, createSelection, JobNotFoundError } from "@/lib/selections/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["selections:read"], async (request, auth) => {
  const jobId = new URL(request.url).searchParams.get("jobId");

  const selections = await db.selection.findMany({
    where: { organizationId: auth.organizationId, ...(jobId ? { jobId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json({ data: selections });
});

export const POST = withApiAuth(["selections:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createSelectionSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The selection could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const selection = await createSelection({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: selection }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    if (error instanceof AllowanceNotFoundError) return apiError(422, "unknown_allowance", error.message);
    throw error;
  }
});
