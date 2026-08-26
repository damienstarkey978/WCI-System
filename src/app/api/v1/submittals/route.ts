/** /api/v1/submittals — create/list Submittals (material specs / shop drawings). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createSubmittalSchema, formatZodIssues } from "@/lib/api-schemas";
import { createSubmittal, JobNotFoundError } from "@/lib/submittals/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["submittals:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const status = params.get("status");

  const submittals = await db.submittal.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { revisions: { orderBy: { revisionNumber: "desc" } } },
  });

  return Response.json({ data: submittals });
});

export const POST = withApiAuth(["submittals:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createSubmittalSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The submittal could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const submittal = await createSubmittal({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: submittal }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    throw error;
  }
});
