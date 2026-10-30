/**
 * /api/v1/jobs/{jobId}/permitting-flags — NOC / NTBO (booleans + number/date) /
 * building-permit-docs-created.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, parseOptionalDate, updateJobPermittingFlagsSchema } from "@/lib/api-schemas";
import { formatDateOnly } from "@/lib/date-only";
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
    const job = await setJobNocNtbo(auth.organizationId, jobId, {
      nocOnFile: parsed.data.nocOnFile,
      ntboFiled: parsed.data.ntboFiled,
      nocNumber: parsed.data.nocNumber,
      ntboNumber: parsed.data.ntboNumber,
      nocFiledOn: parseOptionalDate(parsed.data.nocFiledOn),
      ntboFiledOn: parseOptionalDate(parsed.data.ntboFiledOn),
      buildingPermitDocsCreated: parsed.data.buildingPermitDocsCreated,
    });
    return Response.json({
      data: {
        id: job.id,
        nocOnFile: job.nocOnFile,
        nocNumber: job.nocNumber,
        nocFiledOn: formatDateOnly(job.nocFiledOn),
        ntboFiled: job.ntboFiled,
        ntboNumber: job.ntboNumber,
        ntboFiledOn: formatDateOnly(job.ntboFiledOn),
        buildingPermitDocsCreatedAt: job.buildingPermitDocsCreatedAt,
      },
    });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
