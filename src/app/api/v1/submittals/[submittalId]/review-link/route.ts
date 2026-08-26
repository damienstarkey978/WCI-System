/**
 * /api/v1/submittals/[submittalId]/review-link — issue a single-use review
 * link for an external reviewer who needs no account (CLAUDE.md 2.3).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, issueSubmittalReviewLinkSchema } from "@/lib/api-schemas";
import { issueReviewLink, SubmittalNotFoundError } from "@/lib/submittals/service";

type Context = { params: Promise<{ submittalId: string }> };

export const POST = withApiAuth<Context>(["submittals:write"], async (request, auth, context) => {
  const { submittalId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = issueSubmittalReviewLinkSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The review link could not be issued.", formatZodIssues(parsed.error));
  }

  try {
    const { token } = await issueReviewLink({ organizationId: auth.organizationId, submittalId, ...parsed.data });
    return Response.json({ data: { token } }, { status: 201 });
  } catch (error) {
    if (error instanceof SubmittalNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
