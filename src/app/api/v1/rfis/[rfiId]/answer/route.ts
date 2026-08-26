import { apiError, withApiAuth } from "@/lib/api-auth";
import { answerRfiSchema, formatZodIssues } from "@/lib/api-schemas";
import { answerRfi, RfiAlreadyClosedError, RfiNotFoundError } from "@/lib/rfis/service";

type Context = { params: Promise<{ rfiId: string }> };

export const POST = withApiAuth<Context>(["rfis:write"], async (request, auth, context) => {
  const { rfiId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = answerRfiSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "An answer is required.", formatZodIssues(parsed.error));
  }

  try {
    const rfi = await answerRfi(auth.organizationId, rfiId, parsed.data.answer);
    return Response.json({ data: rfi });
  } catch (error) {
    if (error instanceof RfiNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof RfiAlreadyClosedError) {
      return apiError(409, "already_closed", error.message);
    }
    throw error;
  }
});
