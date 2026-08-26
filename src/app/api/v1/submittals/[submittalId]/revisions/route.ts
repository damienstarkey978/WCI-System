/** /api/v1/submittals/[submittalId]/revisions — add a revision. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { addSubmittalRevisionSchema, formatZodIssues } from "@/lib/api-schemas";
import { addRevision, SubmittalNotFoundError } from "@/lib/submittals/service";

type Context = { params: Promise<{ submittalId: string }> };

export const POST = withApiAuth<Context>(["submittals:write"], async (request, auth, context) => {
  const { submittalId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = addSubmittalRevisionSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The revision could not be added.", formatZodIssues(parsed.error));
  }

  try {
    const revision = await addRevision(auth.organizationId, submittalId, parsed.data.documentUrl, parsed.data.notes);
    return Response.json({ data: revision }, { status: 201 });
  } catch (error) {
    if (error instanceof SubmittalNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
