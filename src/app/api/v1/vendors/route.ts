/** /api/v1/vendors — create/list Vendor Portal contacts. */

import { Prisma } from "@/generated/prisma/client";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { createVendorSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { createVendor } from "@/lib/vendor-portal/service";

export const GET = withApiAuth(["vendors:read"], async (request, auth) => {
  const jobId = new URL(request.url).searchParams.get("jobId");

  const vendors = await db.vendor.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobAccess: { some: { jobId } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { jobAccess: true },
  });

  return Response.json({ data: vendors });
});

export const POST = withApiAuth(["vendors:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createVendorSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The vendor could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const vendor = await createVendor({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: vendor }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(409, "duplicate_email", "A vendor with this email already exists.");
    }
    throw error;
  }
});
