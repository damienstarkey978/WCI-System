/** /api/v1/warranty-claims — create/list Warranty claims. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createWarrantyClaimSchema, formatZodIssues } from "@/lib/api-schemas";
import { ClientNotFoundError, createWarrantyClaim, JobNotFoundError } from "@/lib/warranty/service";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export const GET = withApiAuth(["warranty:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const status = params.get("status");

  const claims = await db.warrantyClaim.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return Response.json({ data: claims });
});

export const POST = withApiAuth(["warranty:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createWarrantyClaimSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The warranty claim could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const claim = await createWarrantyClaim({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: claim }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    if (error instanceof ClientNotFoundError) return apiError(422, "unknown_client", error.message);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(409, "duplicate_claim_number", `Warranty claim "${parsed.data.claimNumber}" already exists.`);
    }
    throw error;
  }
});
