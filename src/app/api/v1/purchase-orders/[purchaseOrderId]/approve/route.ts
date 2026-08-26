/**
 * /api/v1/purchase-orders/{purchaseOrderId}/approve
 *
 * Approval is what moves a PO's money from `pendingCost` to `committedCost` in the
 * funnel, so it is an explicit action with its own event rather than a status field
 * anyone can PATCH.
 */

import { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { extendedCostCents } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import { emitEvent } from "@/lib/webhooks";

type Context = { params: Promise<{ purchaseOrderId: string }> };

/** A PO can only be approved from a state that is still awaiting a decision. */
const APPROVABLE_FROM: readonly PurchaseOrderStatus[] = [
  PurchaseOrderStatus.DRAFT,
  PurchaseOrderStatus.PENDING_APPROVAL,
];

export const POST = withApiAuth<Context>(["purchase-orders:write"], async (_request, auth, context) => {
  const { purchaseOrderId } = await context.params;

  const existing = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId: auth.organizationId },
    include: { lineItems: true },
  });

  if (!existing) {
    return apiError(404, "not_found", `No purchase order ${purchaseOrderId} in this organization.`);
  }

  if (existing.status === PurchaseOrderStatus.APPROVED) {
    // Idempotent: Duke retrying a call must not look like a failure.
    return Response.json({ data: existing, meta: { alreadyApproved: true } });
  }

  if (!APPROVABLE_FROM.includes(existing.status)) {
    return apiError(409, "not_approvable", `A ${existing.status} purchase order cannot be approved.`, {
      currentStatus: existing.status,
      approvableFrom: APPROVABLE_FROM,
    });
  }

  const purchaseOrder = await db.purchaseOrder.update({
    where: { id: existing.id },
    data: { status: PurchaseOrderStatus.APPROVED, approvedAt: new Date() },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  const totalCents = purchaseOrder.lineItems.reduce(
    (total, item) => total + extendedCostCents(item.quantityMilli, item.unitCostCents),
    0,
  );

  await emitEvent(auth.organizationId, "po.approved", {
    purchaseOrderId: purchaseOrder.id,
    jobId: purchaseOrder.jobId,
    poNumber: purchaseOrder.poNumber,
    vendorName: purchaseOrder.vendorName,
    totalCents,
    approvedAt: purchaseOrder.approvedAt?.toISOString() ?? null,
  });

  return Response.json({ data: { ...purchaseOrder, totalCents } });
});
