/** /api/v1/surveys — create/list Surveys (with their questions). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createSurveySchema, formatZodIssues } from "@/lib/api-schemas";
import { createSurvey, JobNotFoundError } from "@/lib/surveys/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["surveys:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const touchpoint = params.get("touchpoint");

  const surveys = await db.survey.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(touchpoint ? { touchpoint: touchpoint as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json({ data: surveys });
});

export const POST = withApiAuth(["surveys:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createSurveySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The survey could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const survey = await createSurvey({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: survey }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    throw error;
  }
});
