/**
 * /api/v1/purchase-orders — Duke's primary write surface.
 */

import { Prisma } from "@/generated/prisma/client";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { createPurchaseOrderSchema, formatZodIssues } from "@/lib/api-schemas";
import { extendedCostCents } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import { acceptsNewCommitments } from "@/lib/job-status";
import { emitEvent } from "@/lib/webhooks";

export const GET = withApiAuth(["purchase-orders:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const status = params.get("status");

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json({ data: purchaseOrders });
});

export const POST = withApiAuth(["purchase-orders:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createPurchaseOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The purchase order could not be created.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: auth.organizationId },
    select: { id: true, status: true },
  });
  if (!job) {
    return apiError(422, "unknown_job", `No job ${input.jobId} in this organization.`);
  }

  // A closed or not-yet-sold job must not accumulate new commitments — that is how
  // costs land on jobs nobody is watching any more.
  if (!acceptsNewCommitments(job.status)) {
    return apiError(409, "job_not_open", `Job ${input.jobId} is ${job.status} and cannot take new purchase orders.`);
  }

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

  if (input.vendorId) {
    const vendor = await db.vendor.findFirst({ where: { id: input.vendorId, organizationId: auth.organizationId }, select: { id: true } });
    if (!vendor) {
      return apiError(422, "unknown_vendor", `No vendor ${input.vendorId} in this organization.`);
    }
  }

  try {
    const purchaseOrder = await db.purchaseOrder.create({
      data: {
        organizationId: auth.organizationId,
        jobId: input.jobId,
        poNumber: input.poNumber,
        poSuffix: input.poSuffix ?? null,
        vendorName: input.vendorName,
        vendorId: input.vendorId ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        lineItems: {
          create: input.lineItems.map((item, index) => ({
            costCodeId: item.costCodeId,
            costType: item.costType ?? defaultCostTypeById.get(item.costCodeId) ?? "NONE",
            title: item.title,
            quantityMilli: item.quantityMilli,
            unitCostCents: item.unitCostCents,
            sortOrder: index,
          })),
        },
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    const totalCents = purchaseOrder.lineItems.reduce(
      (total, item) => total + extendedCostCents(item.quantityMilli, item.unitCostCents),
      0,
    );

    await emitEvent(auth.organizationId, "po.created", {
      purchaseOrderId: purchaseOrder.id,
      jobId: purchaseOrder.jobId,
      poNumber: purchaseOrder.poNumber,
      vendorName: purchaseOrder.vendorName,
      status: purchaseOrder.status,
      totalCents,
    });

    return Response.json({ data: { ...purchaseOrder, totalCents } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(409, "duplicate_po_number", `Purchase order "${input.poNumber}" already exists.`);
    }
    throw error;
  }
});
