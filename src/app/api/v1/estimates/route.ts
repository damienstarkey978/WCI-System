/**
 * /api/v1/estimates — Neil's (estimator) surface, and the entry point to the budget.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createEstimateSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";

export const GET = withApiAuth(["estimates:read"], async (request, auth) => {
  const jobId = new URL(request.url).searchParams.get("jobId");

  const estimates = await db.estimate.findMany({
    where: { organizationId: auth.organizationId, ...(jobId ? { jobId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json({ data: estimates });
});

export const POST = withApiAuth(["estimates:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createEstimateSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The estimate could not be created.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!job) {
    return apiError(422, "unknown_job", `No job ${input.jobId} in this organization.`);
  }

  // Every referenced cost code must belong to this org, or a caller could attach
  // another tenant's catalog to their estimate.
  const costCodeIds = [...new Set(input.lineItems.map((item) => item.costCodeId))];
  const known = await db.costCode.findMany({
    where: { id: { in: costCodeIds }, organizationId: auth.organizationId },
    select: { id: true, defaultCostType: true },
  });
  if (known.length !== costCodeIds.length) {
    const knownIds = new Set(known.map((code) => code.id));
    return apiError(422, "unknown_cost_code", "One or more cost codes are not in this organization.", {
      unknown: costCodeIds.filter((id) => !knownIds.has(id)),
    });
  }
  const defaultCostTypeById = new Map(known.map((code) => [code.id, code.defaultCostType]));

  const estimate = await db.estimate.create({
    data: {
      organizationId: auth.organizationId,
      jobId: input.jobId,
      title: input.title,
      rateMode: input.rateMode,
      defaultRateBasisPoints: input.defaultRateBasisPoints,
      lineItems: {
        create: input.lineItems.map((item, index) => ({
          costCodeId: item.costCodeId,
          costType: item.costType ?? defaultCostTypeById.get(item.costCodeId) ?? "NONE",
          title: item.title,
          description: item.description ?? null,
          quantityMilli: item.quantityMilli,
          unitCostCents: item.unitCostCents,
          // Line rates fall back to the estimate's default, so a caller can set the
          // markup once instead of repeating it on every line.
          rateMode: item.rateMode ?? input.rateMode,
          rateBasisPoints: item.rateBasisPoints ?? input.defaultRateBasisPoints,
          taxable: item.taxable ?? false,
          internalNote: item.internalNote ?? null,
          groupLabel: item.groupLabel ?? null,
          sortOrder: index,
        })),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json({ data: estimate }, { status: 201 });
});
