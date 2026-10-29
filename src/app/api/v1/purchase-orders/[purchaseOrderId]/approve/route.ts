/**
 * /api/v1/purchase-orders/{purchaseOrderId}/approve
 *
 * Approval is what moves a PO's money from `pendingCost` to `committedCost` in the
 * funnel, so it is an explicit action with its own event rather than a status field
 * anyone can PATCH. Attribution always stamps the calling ApiKey on PurchaseOrderEvent.
 */

import { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { actorFromApiKey } from "@/lib/actor";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { extendedCostCents } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import {
  approvePurchaseOrder,
  InvalidPurchaseOrderTransitionError,
  PurchaseOrderNotFoundError,
} from "@/lib/purchase-orders/workflow";
import { emitEvent } from "@/lib/webhooks";

type Context = { params: Promise<{ purchaseOrderId: string }> };

/** A PO can only be approved from a state that is still awaiting a decision. */
const APPROVABLE_FROM: readonly PurchaseOrderStatus[] = [
  PurchaseOrderStatus.DRAFT,
  PurchaseOrderStatus.PENDING_APPROVAL,
];

export const POST = withApiAuth<Context>(["purchase-orders:write"], async (_request, auth, context) => {
  const { purchaseOrderId } = await context.params;
  const actor = actorFromApiKey(auth.apiKeyId);

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

  // Workflow refuses DRAFT → APPROVED (must send for approval first). The API
  // historically allowed Duke to approve a draft in one hop — keep that, but
  // always write a PurchaseOrderEvent with the ApiKey actor.
  if (existing.status === PurchaseOrderStatus.PENDING_APPROVAL) {
    try {
      await approvePurchaseOrder({
        organizationId: auth.organizationId,
        purchaseOrderId: existing.id,
        approvedBy: "INTERNAL",
        actor,
      });
    } catch (error) {
      if (error instanceof PurchaseOrderNotFoundError) {
        return apiError(404, "not_found", error.message);
      }
      if (error instanceof InvalidPurchaseOrderTransitionError) {
        return apiError(409, "not_approvable", error.message, {
          currentStatus: error.from,
          attemptedStatus: error.to,
        });
      }
      throw error;
    }
  } else {
    await db.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id: existing.id },
        data: {
          status: PurchaseOrderStatus.APPROVED,
          approvedAt: new Date(),
          approvedBy: "INTERNAL",
        },
      });
      await tx.purchaseOrderEvent.create({
        data: {
          purchaseOrderId: existing.id,
          type: "APPROVED",
          version: existing.version,
          actorUserId: null,
          actorApiKeyId: auth.apiKeyId,
          note: "Approved internally via API (from DRAFT)",
        },
      });
    });

    const totalCents = existing.lineItems.reduce(
      (total, item) => total + extendedCostCents(item.quantityMilli, item.unitCostCents),
      0,
    );
    await emitEvent(auth.organizationId, "po.approved", {
      purchaseOrderId: existing.id,
      jobId: existing.jobId,
      poNumber: existing.poNumber,
      vendorName: existing.vendorName,
      totalCents,
      approvedBy: "INTERNAL",
    });
  }

  const purchaseOrder = await db.purchaseOrder.findFirstOrThrow({
    where: { id: existing.id },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  const totalCents = purchaseOrder.lineItems.reduce(
    (total, item) => total + extendedCostCents(item.quantityMilli, item.unitCostCents),
    0,
  );

  return Response.json({ data: { ...purchaseOrder, totalCents } });
});
