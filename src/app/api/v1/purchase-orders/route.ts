/**
 * /api/v1/purchase-orders — Duke's primary write surface.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createPurchaseOrderSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import {
  createPurchaseOrder,
  DuplicatePoNumberError,
  JobNotFoundError,
  JobNotOpenError,
  UnknownCostCodeError,
  UnknownVendorError,
} from "@/lib/purchase-orders/service";

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

  try {
    const purchaseOrder = await createPurchaseOrder({ organizationId: auth.organizationId, ...input });
    return Response.json({ data: purchaseOrder }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    if (error instanceof JobNotOpenError) return apiError(409, "job_not_open", error.message);
    if (error instanceof UnknownCostCodeError) {
      return apiError(422, "unknown_cost_code", error.message, { unknown: error.unknownIds });
    }
    if (error instanceof UnknownVendorError) return apiError(422, "unknown_vendor", error.message);
    if (error instanceof DuplicatePoNumberError) return apiError(409, "duplicate_po_number", error.message);
    throw error;
  }
});
