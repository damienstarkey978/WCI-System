/**
 * /api/v1/surveys/[surveyId]/response-link — issue a single-use response
 * link for a recipient who needs no account.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, issueSurveyResponseLinkSchema } from "@/lib/api-schemas";
import { issueResponseLink, SurveyNotFoundError } from "@/lib/surveys/service";

type Context = { params: Promise<{ surveyId: string }> };

export const POST = withApiAuth<Context>(["surveys:write"], async (request, auth, context) => {
  const { surveyId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = issueSurveyResponseLinkSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The response link could not be issued.", formatZodIssues(parsed.error));
  }

  try {
    const { token } = await issueResponseLink({ organizationId: auth.organizationId, surveyId, ...parsed.data });
    return Response.json({ data: { token } }, { status: 201 });
  } catch (error) {
    if (error instanceof SurveyNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
