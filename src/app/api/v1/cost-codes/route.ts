/**
 * /api/v1/cost-codes — the org-level cost code catalog.
 *
 * Read access matters early: Neil (estimator) and Duke (purchasing) both need to map
 * line items onto WCI's real taxonomy rather than inventing codes.
 */

import { Prisma } from "@/generated/prisma/client";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { createCostCodeSchema, formatZodIssues, listCostCodesQuerySchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";

export const GET = withApiAuth(["cost-codes:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = listCostCodesQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { includeInactive, costType } = parsed.data;

  const costCodes = await db.costCode.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(includeInactive ? {} : { isActive: true }),
      ...(costType ? { defaultCostType: costType } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });

  return Response.json({ data: costCodes });
});

export const POST = withApiAuth(["cost-codes:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createCostCodeSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The cost code could not be created.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  if (input.parentId) {
    const parent = await db.costCode.findFirst({
      where: { id: input.parentId, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!parent) {
      return apiError(422, "unknown_parent", `No cost code ${input.parentId} in this organization.`);
    }
  }

  try {
    const costCode = await db.costCode.create({
      data: { ...input, organizationId: auth.organizationId },
    });
    return Response.json({ data: costCode }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(409, "duplicate_code", `Cost code "${input.code}" already exists.`);
    }
    throw error;
  }
});
