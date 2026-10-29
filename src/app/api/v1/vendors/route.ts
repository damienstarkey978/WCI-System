/** /api/v1/vendors — create/list Vendor Portal contacts. */

import { Prisma } from "@/generated/prisma/client";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { createVendorSchema, formatZodIssues, listVendorsQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import { db } from "@/lib/db";
import { createVendor } from "@/lib/vendor-portal/service";

export const GET = withApiAuth(["vendors:read"], async (request, auth) => {
  const parsed = listVendorsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { jobId, limit, cursor } = parsed.data;

  const vendors = await db.vendor.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobAccess: { some: { jobId } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { jobAccess: true },
  });

  return Response.json(toCursorPage(vendors, limit));
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
