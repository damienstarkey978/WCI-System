/**
 * /api/v1/jobs/{jobId}/permitting-flags — NOC on file / NTBO filed toggles.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateJobPermittingFlagsSchema } from "@/lib/api-schemas";
import { JobNotFoundError, setJobNocNtbo } from "@/lib/permitting/service";

type Context = { params: Promise<{ jobId: string }> };

export const PATCH = withApiAuth<Context>(["permits:write"], async (request, auth, context) => {
  const { jobId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = updateJobPermittingFlagsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Permitting flags could not be updated.", formatZodIssues(parsed.error));
  }

  try {
    const job = await setJobNocNtbo(auth.organizationId, jobId, parsed.data);
    return Response.json({
      data: { id: job.id, nocOnFile: job.nocOnFile, ntboFiled: job.ntboFiled },
    });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
