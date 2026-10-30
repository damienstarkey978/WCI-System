/**
 * /api/v1/purchase-orders/{purchaseOrderId}/recall
 *
 * Cancels (voids) a PO — Buildertrend "Recall". Removes it from committedCost in
 * the funnel. Used to clean Unassigned JOB_* import twins (Heather 2pm #15 / 1pm #8)
 * without a direct DB write. Idempotent when already CANCELLED.
 */

import { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { actorFromApiKey } from "@/lib/actor";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import {
  InvalidPurchaseOrderTransitionError,
  PurchaseOrderNotFoundError,
  recallPurchaseOrder,
} from "@/lib/purchase-orders/workflow";

type Context = { params: Promise<{ purchaseOrderId: string }> };

export const POST = withApiAuth<Context>(["purchase-orders:write"], async (request, auth, context) => {
  const { purchaseOrderId } = await context.params;
  const actor = actorFromApiKey(auth.apiKeyId);

  let reason: string | null = null;
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason === "string" && body.reason.trim()) reason = body.reason.trim();
  } catch {
    // empty body is fine
  }

  const existing = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId: auth.organizationId },
    select: { id: true, status: true, poNumber: true },
  });

  if (!existing) {
    return apiError(404, "not_found", `No purchase order ${purchaseOrderId} in this organization.`);
  }

  if (existing.status === PurchaseOrderStatus.CANCELLED) {
    return Response.json({ data: existing, meta: { alreadyCancelled: true } });
  }

  try {
    const updated = await recallPurchaseOrder({
      organizationId: auth.organizationId,
      purchaseOrderId: existing.id,
      reason: reason ?? "Recalled via API",
      actor,
    });
    return Response.json({ data: updated });
  } catch (error) {
    if (error instanceof PurchaseOrderNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof InvalidPurchaseOrderTransitionError) {
      return apiError(409, "not_recallable", error.message, {
        currentStatus: error.from,
        attemptedStatus: error.to,
      });
    }
    throw error;
  }
});
