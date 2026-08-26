/** /api/v1/specifications/generate-from-estimate — auto-build a Specification from an Estimate. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, generateSpecificationFromEstimateSchema } from "@/lib/api-schemas";
import {
  EstimateJobMismatchError,
  EstimateNotFoundError,
  generateSpecificationFromEstimate,
  JobNotFoundError,
} from "@/lib/specifications/service";

export const POST = withApiAuth(["specifications:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = generateSpecificationFromEstimateSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The specification could not be generated.", formatZodIssues(parsed.error));
  }

  try {
    const specification = await generateSpecificationFromEstimate(
      auth.organizationId,
      parsed.data.jobId,
      parsed.data.estimateId,
      parsed.data.title,
    );
    return Response.json({ data: specification }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    if (error instanceof EstimateNotFoundError) return apiError(422, "unknown_estimate", error.message);
    if (error instanceof EstimateJobMismatchError) return apiError(422, "estimate_job_mismatch", error.message);
    throw error;
  }
});
