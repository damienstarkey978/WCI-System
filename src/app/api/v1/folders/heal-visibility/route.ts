/**
 * POST /api/v1/folders/heal-visibility — flip wrongly-public inspection/termite
 * folders and imported cost DOCUMENT files to clientVisible/subVisible false.
 *
 * Body optional: `{ jobId?: string, jobStatuses?: ("OPEN"|"WARRANTY"|…)[] }`.
 * Default scope: all OPEN + WARRANTY jobs in the org.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, healFileVisibilitySchema } from "@/lib/api-schemas";
import { healFileVisibility } from "@/lib/files/heal-visibility";

export const POST = withApiAuth(["files:write"], async (request, auth) => {
  let payload: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
  }

  const parsed = healFileVisibilitySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid heal-visibility body.", formatZodIssues(parsed.error));
  }

  try {
    const result = await healFileVisibility(auth.organizationId, {
      jobId: parsed.data.jobId,
      jobStatuses: parsed.data.jobStatuses,
    });
    return Response.json({ data: result });
  } catch (error) {
    console.error("POST /api/v1/folders/heal-visibility failed:", error);
    return apiError(
      500,
      "heal_visibility_failed",
      error instanceof Error ? error.message : "Visibility heal failed.",
    );
  }
});
