/** /api/v1/bid-packages — create/list Bid Packages. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createBidPackageSchema, formatZodIssues } from "@/lib/api-schemas";
import { createBidPackage, JobNotFoundError } from "@/lib/bids/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["bids:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const status = params.get("status");

  const bidPackages = await db.bidPackage.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { lineItems: { orderBy: { sortOrder: "asc" } }, submissions: true },
  });

  return Response.json({ data: bidPackages });
});

export const POST = withApiAuth(["bids:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createBidPackageSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The bid package could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const bidPackage = await createBidPackage({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: bidPackage }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    throw error;
  }
});
