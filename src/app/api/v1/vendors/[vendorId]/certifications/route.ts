/** /api/v1/vendors/[vendorId]/certifications — track cert/insurance expiry. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { addCertificationSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { addCertification, VendorNotFoundError } from "@/lib/vendor-portal/service";

type Context = { params: Promise<{ vendorId: string }> };

export const GET = withApiAuth<Context>(["vendors:read"], async (_request, auth, context) => {
  const { vendorId } = await context.params;

  const certifications = await db.vendorCertification.findMany({
    where: { vendorId, vendor: { organizationId: auth.organizationId } },
    orderBy: { expiresAt: "asc" },
  });

  return Response.json({ data: certifications });
});

export const POST = withApiAuth<Context>(["vendors:write"], async (request, auth, context) => {
  const { vendorId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = addCertificationSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The certification could not be added.", formatZodIssues(parsed.error));
  }

  try {
    const certification = await addCertification({ organizationId: auth.organizationId, vendorId, ...parsed.data });
    return Response.json({ data: certification }, { status: 201 });
  } catch (error) {
    if (error instanceof VendorNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
