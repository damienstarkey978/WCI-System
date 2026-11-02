/**
 * POST /api/v1/jobs/{jobId}/parcel/confirm — lock a Duval parcel onto the job cache.
 * Body: parcel result from GET /parcels/duval (staff-confirmed). Never invents data.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { DuvalParcelLookupError } from "@/lib/permitting/duval-parcel";
import {
  assertParcelResult,
  confirmParcelOnJob,
  JobParcelCacheError,
} from "@/lib/permitting/parcel-cache";

type Context = { params: Promise<{ jobId: string }> };

export const POST = withApiAuth<Context>(["permits:write"], async (request, auth, context) => {
  const { jobId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const parcelRaw = body.parcel ?? body;

  try {
    const parcel = assertParcelResult(parcelRaw);
    const { job, snapshot, packageFields } = await confirmParcelOnJob(
      auth.organizationId,
      jobId,
      parcel,
    );
    return Response.json({
      data: {
        jobId: job.id,
        parcelId: job.parcelId,
        ownerOfRecord: job.ownerOfRecord,
        legalDescription: job.legalDescription,
        parcelConfirmedAt: job.parcelConfirmedAt,
        snapshot,
        packageFields,
      },
    });
  } catch (error) {
    if (error instanceof JobParcelCacheError) {
      return apiError(
        error.code === "not_found" ? 404 : 422,
        error.code === "not_found" ? "not_found" : "validation_failed",
        error.message,
      );
    }
    if (error instanceof DuvalParcelLookupError) {
      return apiError(422, "validation_failed", error.message);
    }
    throw error;
  }
});
