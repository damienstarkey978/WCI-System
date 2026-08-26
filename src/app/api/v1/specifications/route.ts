/** /api/v1/specifications — create/list Specifications (manual or auto-generated). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createSpecificationSchema, formatZodIssues } from "@/lib/api-schemas";
import { createSpecification, JobNotFoundError } from "@/lib/specifications/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["specifications:read"], async (request, auth) => {
  const jobId = new URL(request.url).searchParams.get("jobId");

  const specifications = await db.specification.findMany({
    where: { organizationId: auth.organizationId, ...(jobId ? { jobId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json({ data: specifications });
});

export const POST = withApiAuth(["specifications:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createSpecificationSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The specification could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const specification = await createSpecification({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: specification }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    throw error;
  }
});
