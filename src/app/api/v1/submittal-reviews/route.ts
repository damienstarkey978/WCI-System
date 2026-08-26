/**
 * POST /api/v1/submittal-reviews — an external reviewer (no account) records
 * their decision. The review-link token travels as Authorization: Bearer,
 * same convention as every other headless action in this system, which is
 * what lets src/proxy.ts's blanket "every /api/v1/* call needs an
 * Authorization or x-api-key header" rule hold here too with no carve-out —
 * this route is public in every other sense (no API key, no portal session).
 */

import { apiError, extractToken } from "@/lib/api-auth";
import { formatZodIssues, recordSubmittalReviewSchema } from "@/lib/api-schemas";
import { InvalidReviewLinkError, recordReview } from "@/lib/submittals/service";

export async function POST(request: Request) {
  const token = extractToken(request);
  if (!token) return apiError(401, "unauthorized", "A review link token is required.");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = recordSubmittalReviewSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The review could not be recorded.", formatZodIssues(parsed.error));
  }

  try {
    const result = await recordReview({ token, ...parsed.data });
    return Response.json({ data: result.submittal });
  } catch (error) {
    if (error instanceof InvalidReviewLinkError) return apiError(401, "invalid_token", error.message);
    throw error;
  }
}
