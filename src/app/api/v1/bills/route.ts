/**
 * /api/v1/bills — the other half of Duke's surface.
 *
 * A bill raised against a PO carries `purchaseOrderId`, which is what makes
 * PO-to-bill reconciliation (and the poSuffix workflow) possible.
 */

import { actorFromApiKey } from "@/lib/actor";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { createBillSchema, formatZodIssues, listBillsQuerySchema } from "@/lib/api-schemas";
import { toCursorPage } from "@/lib/api-pagination";
import {
  createBill,
  JobNotFoundError,
  JobNotOpenError,
  PurchaseOrderJobMismatchError,
  UnknownCostCodeError,
  UnknownPurchaseOrderError,
  UnknownVendorError,
} from "@/lib/bills/service";
import { formatDateOnly } from "@/lib/date-only";
import { db } from "@/lib/db";

/** Date-only bill fields as YYYY-MM-DD; paidAt stays ISO unless it was a midnight import. */
function serializeBill<T extends {
  id: string;
  issuedOn: Date | null;
  dueOn: Date | null;
  paidAt: Date | null;
}>(bill: T) {
  return {
    ...bill,
    issuedOn: formatDateOnly(bill.issuedOn),
    dueOn: formatDateOnly(bill.dueOn),
    // Imported PAID stamps are often UTC midnight of the pay day — emit date-only then.
    paidAt:
      bill.paidAt &&
      bill.paidAt.getUTCHours() === 0 &&
      bill.paidAt.getUTCMinutes() === 0 &&
      bill.paidAt.getUTCSeconds() === 0 &&
      bill.paidAt.getUTCMilliseconds() === 0
        ? formatDateOnly(bill.paidAt)
        : bill.paidAt,
  };
}

export const GET = withApiAuth(["bills:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = listBillsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { jobId, approvalStatus, limit, cursor } = parsed.data;

  const bills = await db.bill.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(approvalStatus ? { approvalStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
    // One more than asked for, so hasMore is known without a second count query.
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  const page = toCursorPage(bills, limit);
  return Response.json({
    data: page.data.map(serializeBill),
    pagination: page.pagination,
  });
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
    const bill = await createBill({
      organizationId: auth.organizationId,
      ...input,
      actor: actorFromApiKey(auth.apiKeyId),
    });
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
