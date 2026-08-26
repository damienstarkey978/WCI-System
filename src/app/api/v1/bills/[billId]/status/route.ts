/**
 * /api/v1/bills/{billId}/status — AP approval routing.
 *
 * IN_REVIEW → APPROVED → READY_FOR_PAYMENT → PAID, with VOID reachable from any
 * unpaid state. The transitions are guarded because each one moves money in the
 * funnel: reaching PAID is what makes a bill count as actual cost under cash basis.
 */

import { BillApprovalStatus } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateBillStatusSchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { emitEvent } from "@/lib/webhooks";

type Context = { params: Promise<{ billId: string }> };

const ALLOWED_TRANSITIONS: Readonly<Record<BillApprovalStatus, readonly BillApprovalStatus[]>> = {
  [BillApprovalStatus.IN_REVIEW]: [BillApprovalStatus.APPROVED, BillApprovalStatus.VOID],
  [BillApprovalStatus.APPROVED]: [
    BillApprovalStatus.READY_FOR_PAYMENT,
    BillApprovalStatus.IN_REVIEW,
    BillApprovalStatus.VOID,
  ],
  [BillApprovalStatus.READY_FOR_PAYMENT]: [
    BillApprovalStatus.PAID,
    BillApprovalStatus.APPROVED,
    BillApprovalStatus.VOID,
  ],
  // A paid bill is settled. Correcting one means voiding and re-entering it, so the
  // correction leaves a trail instead of quietly rewriting history.
  [BillApprovalStatus.PAID]: [],
  [BillApprovalStatus.VOID]: [],
};

export const POST = withApiAuth<Context>(["bills:write"], async (request, auth, context) => {
  const { billId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = updateBillStatusSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid bill status request.", formatZodIssues(parsed.error));
  }
  const { approvalStatus } = parsed.data;

  const bill = await db.bill.findFirst({
    where: { id: billId, organizationId: auth.organizationId },
    include: { lineItems: true },
  });
  if (!bill) {
    return apiError(404, "not_found", `No bill ${billId} in this organization.`);
  }

  if (bill.approvalStatus === approvalStatus) {
    return Response.json({ data: bill, meta: { unchanged: true } });
  }

  if (!ALLOWED_TRANSITIONS[bill.approvalStatus].includes(approvalStatus)) {
    return apiError(
      409,
      "illegal_transition",
      `A ${bill.approvalStatus} bill cannot move to ${approvalStatus}.`,
      { currentStatus: bill.approvalStatus, allowed: ALLOWED_TRANSITIONS[bill.approvalStatus] },
    );
  }

  const updated = await db.bill.update({
    where: { id: bill.id },
    data: {
      approvalStatus,
      paidAt: approvalStatus === BillApprovalStatus.PAID ? (bill.paidAt ?? new Date()) : bill.paidAt,
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  const totalCents = updated.lineItems.reduce((total, item) => total + item.amountCents, 0);
  const eventPayload = {
    billId: updated.id,
    jobId: updated.jobId,
    purchaseOrderId: updated.purchaseOrderId,
    vendorName: updated.vendorName,
    approvalStatus: updated.approvalStatus,
    totalCents,
  };

  if (approvalStatus === BillApprovalStatus.READY_FOR_PAYMENT) {
    await emitEvent(auth.organizationId, "bill.ready_for_payment", eventPayload);
  } else if (approvalStatus === BillApprovalStatus.PAID) {
    await emitEvent(auth.organizationId, "bill.paid", eventPayload);
  }

  return Response.json({ data: { ...updated, totalCents } });
});
