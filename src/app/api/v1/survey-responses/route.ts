/**
 * POST /api/v1/survey-responses — a recipient (no account) submits their
 * answers. The response-link token travels as Authorization: Bearer, same
 * convention as /submittal-reviews.
 */

import { apiError, extractToken } from "@/lib/api-auth";
import { formatZodIssues, submitSurveyResponseSchema } from "@/lib/api-schemas";
import { InvalidResponseLinkError, submitResponse } from "@/lib/surveys/service";

export async function POST(request: Request) {
  const token = extractToken(request);
  if (!token) return apiError(401, "unauthorized", "A survey response link token is required.");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = submitSurveyResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The response could not be submitted.", formatZodIssues(parsed.error));
  }

  try {
    const result = await submitResponse(token, parsed.data.answers);
    return Response.json({ data: { submittedAt: result.submittedAt } });
  } catch (error) {
    if (error instanceof InvalidResponseLinkError) return apiError(401, "invalid_token", error.message);
    throw error;
  }
}
