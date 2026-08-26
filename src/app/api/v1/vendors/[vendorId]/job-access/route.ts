/** /api/v1/vendors/[vendorId]/job-access — grant/update per-job portal visibility. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, grantVendorJobAccessSchema } from "@/lib/api-schemas";
import { grantVendorJobAccess, JobNotFoundError, VendorNotFoundError } from "@/lib/vendor-portal/service";

type Context = { params: Promise<{ vendorId: string }> };

export const POST = withApiAuth<Context>(["vendors:write"], async (request, auth, context) => {
  const { vendorId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = grantVendorJobAccessSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Job access could not be granted.", formatZodIssues(parsed.error));
  }

  try {
    const access = await grantVendorJobAccess({ organizationId: auth.organizationId, vendorId, ...parsed.data });
    return Response.json({ data: access }, { status: 201 });
  } catch (error) {
    if (error instanceof VendorNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    throw error;
  }
});
