/** /api/v1/rfis */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createRfiSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { createRfi, JobNotFoundError } from "@/lib/rfis/service";

export const GET = withApiAuth(["rfis:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const status = params.get("status");

  const rfis = await db.rfi.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return Response.json({ data: rfis });
});

export const POST = withApiAuth(["rfis:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createRfiSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The RFI could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const rfi = await createRfi({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: rfi }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(422, "unknown_job", error.message);
    }
    throw error;
  }
});
