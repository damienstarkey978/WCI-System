/**
 * /api/v1/bills — the other half of Duke's surface.
 *
 * A bill raised against a PO carries `purchaseOrderId`, which is what makes
 * PO-to-bill reconciliation (and the poSuffix workflow) possible.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createBillSchema, formatZodIssues } from "@/lib/api-schemas";
import {
  createBill,
  JobNotFoundError,
  JobNotOpenError,
  PurchaseOrderJobMismatchError,
  UnknownCostCodeError,
  UnknownPurchaseOrderError,
  UnknownVendorError,
} from "@/lib/bills/service";
import { db } from "@/lib/db";

export const GET = withApiAuth(["bills:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const approvalStatus = params.get("approvalStatus");

  const bills = await db.bill.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(approvalStatus ? { approvalStatus: approvalStatus as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json({ data: bills });
});

export const POST = withApiAuth(["bills:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createBillSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The bill could not be created.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  try {
    const bill = await createBill({ organizationId: auth.organizationId, ...input });
    return Response.json({ data: bill }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) return apiError(422, "unknown_job", error.message);
    if (error instanceof JobNotOpenError) return apiError(409, "job_not_open", error.message);
    if (error instanceof UnknownPurchaseOrderError) return apiError(422, "unknown_purchase_order", error.message);
    if (error instanceof PurchaseOrderJobMismatchError) return apiError(422, "po_job_mismatch", error.message);
    if (error instanceof UnknownCostCodeError) {
      return apiError(422, "unknown_cost_code", error.message, { unknown: error.unknownIds });
    }
    if (error instanceof UnknownVendorError) return apiError(422, "unknown_vendor", error.message);
    throw error;
  }
});
