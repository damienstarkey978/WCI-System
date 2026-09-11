/**
 * /api/v1/purchase-orders — Duke's primary write surface.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createPurchaseOrderSchema, formatZodIssues, listPurchaseOrdersQuerySchema } from "@/lib/api-schemas";
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
  const url = new URL(request.url);
  const parsed = listPurchaseOrdersQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { jobId, status, limit, cursor } = parsed.data;

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    // One more than asked for, so hasMore is known without a second count query.
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  const hasMore = purchaseOrders.length > limit;
  const page = hasMore ? purchaseOrders.slice(0, limit) : purchaseOrders;

  return Response.json({
    data: page,
    pagination: { nextCursor: hasMore ? page[page.length - 1].id : null, hasMore },
  });
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
