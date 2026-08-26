/** /api/v1/warranty-claims/[claimId]/schedule — set the appointment + assigned trade. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, scheduleWarrantyAppointmentSchema } from "@/lib/api-schemas";
import { scheduleAppointment, VendorNotFoundError, WarrantyClaimNotFoundError } from "@/lib/warranty/service";

type Context = { params: Promise<{ claimId: string }> };

export const POST = withApiAuth<Context>(["warranty:write"], async (request, auth, context) => {
  const { claimId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = scheduleWarrantyAppointmentSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The appointment could not be scheduled.", formatZodIssues(parsed.error));
  }

  try {
    const claim = await scheduleAppointment({ organizationId: auth.organizationId, claimId, ...parsed.data });
    return Response.json({ data: claim });
  } catch (error) {
    if (error instanceof WarrantyClaimNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof VendorNotFoundError) return apiError(422, "unknown_vendor", error.message);
    throw error;
  }
});
