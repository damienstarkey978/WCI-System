/**
 * /api/v1/bid-submissions/[bidSubmissionId]/push-to-purchase-order —
 * explicit conversion action (CLAUDE.md 2.3: Bid -> PO).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, pushBidToPurchaseOrderSchema } from "@/lib/api-schemas";
import {
  BidSubmissionNotAcceptedError,
  BidSubmissionNotFoundError,
  MissingCostCodeError,
  pushBidSubmissionToPurchaseOrder,
} from "@/lib/bids/service";
import { Prisma } from "@/generated/prisma/client";

type Context = { params: Promise<{ bidSubmissionId: string }> };

export const POST = withApiAuth<Context>(["bids:write", "purchase-orders:write"], async (request, auth, context) => {
  const { bidSubmissionId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = pushBidToPurchaseOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The purchase order could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const purchaseOrder = await pushBidSubmissionToPurchaseOrder(
      auth.organizationId,
      bidSubmissionId,
      parsed.data.poNumber,
      parsed.data.fallbackCostCodeId,
    );
    return Response.json({ data: purchaseOrder }, { status: 201 });
  } catch (error) {
    if (error instanceof BidSubmissionNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof BidSubmissionNotAcceptedError) return apiError(409, "not_accepted", error.message);
    if (error instanceof MissingCostCodeError) return apiError(422, "missing_cost_code", error.message);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(409, "duplicate_po_number", `Purchase order "${parsed.data.poNumber}" already exists.`);
    }
    throw error;
  }
});
