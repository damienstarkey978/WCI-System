/**
 * Purchase order lifecycle — everything that happens to a PO after
 * createPurchaseOrder() (src/lib/purchase-orders/service.ts) makes it.
 *
 * Two independent axes, per the Sept 2026 Buildertrend audit
 * (claude/buildertrend-financials-uiux-audit-sept2026.md, Gap 1):
 *
 *   PO status:   DRAFT → PENDING_APPROVAL → APPROVED | DECLINED, and CANCELLED
 *                (Buildertrend's "Recalled") from anywhere that isn't already dead.
 *   Work status: NOT_COMPLETE ⇄ WORK_COMPLETE, moved by staff, independent of
 *                whether the PO was ever approved or paid.
 *
 * Only the PO-status axis feeds the commitment funnel (src/lib/budget/funnel.ts
 * counts APPROVED and COMPLETED as committed cost), which is why marking work
 * complete deliberately does not touch status: finishing the work doesn't change
 * what the job is committed to spend.
 */

import type { PurchaseOrderEventType, PurchaseOrderStatus } from "@/generated/prisma/enums";
import { extendedCostCents } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import { emitEvent } from "@/lib/webhooks";

export class PurchaseOrderNotFoundError extends Error {
  constructor(purchaseOrderId: string) {
    super(`No purchase order ${purchaseOrderId} in this organization.`);
    this.name = "PurchaseOrderNotFoundError";
  }
}

export class InvalidPurchaseOrderTransitionError extends Error {
  constructor(
    public readonly from: PurchaseOrderStatus,
    public readonly to: PurchaseOrderStatus,
  ) {
    super(`A ${from} purchase order cannot become ${to}.`);
    this.name = "InvalidPurchaseOrderTransitionError";
  }
}

/** Who drove a change, for the audit trail. Vendor acceptances carry neither. */
export interface PurchaseOrderActor {
  readonly actorUserId?: string | null;
  readonly actorApiKeyId?: string | null;
}

/**
 * Which statuses a PO can move to from each status.
 *
 * DECLINED is not terminal: a declined PO is normally amended and re-sent, which
 * routes back through PENDING_APPROVAL. CANCELLED (recalled) is terminal — a
 * recalled PO is void, and replacing it means cutting a new one.
 */
const ALLOWED_TRANSITIONS: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DECLINED", "CANCELLED"],
  APPROVED: ["COMPLETED", "CANCELLED"],
  DECLINED: ["PENDING_APPROVAL", "CANCELLED"],
  COMPLETED: ["CANCELLED"],
  CANCELLED: [],
};

export function canTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

async function loadPurchaseOrder(organizationId: string, purchaseOrderId: string) {
  const purchaseOrder = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId },
  });
  if (!purchaseOrder) throw new PurchaseOrderNotFoundError(purchaseOrderId);
  return purchaseOrder;
}

function recordEvent(
  purchaseOrderId: string,
  type: PurchaseOrderEventType,
  version: number,
  actor: PurchaseOrderActor,
  note?: string | null,
) {
  return db.purchaseOrderEvent.create({
    data: {
      purchaseOrderId,
      type,
      version,
      actorUserId: actor.actorUserId ?? null,
      actorApiKeyId: actor.actorApiKeyId ?? null,
      note: note ?? null,
    },
  });
}

/** Send a draft (or re-send an amended/declined) PO to its vendor for acceptance. */
export async function sendForApproval(input: {
  readonly organizationId: string;
  readonly purchaseOrderId: string;
  readonly actor?: PurchaseOrderActor;
}) {
  const purchaseOrder = await loadPurchaseOrder(input.organizationId, input.purchaseOrderId);
  if (!canTransition(purchaseOrder.status, "PENDING_APPROVAL")) {
    throw new InvalidPurchaseOrderTransitionError(purchaseOrder.status, "PENDING_APPROVAL");
  }

  const updated = await db.purchaseOrder.update({
    where: { id: purchaseOrder.id },
    data: { status: "PENDING_APPROVAL", declinedAt: null },
  });
  await recordEvent(purchaseOrder.id, "SENT_FOR_APPROVAL", updated.version, input.actor ?? {});
  await emitEvent(input.organizationId, "po.sent_for_approval", {
    purchaseOrderId: updated.id,
    jobId: updated.jobId,
    poNumber: updated.poNumber,
    vendorName: updated.vendorName,
  });
  return updated;
}

/**
 * Approve a PO. `approvedBy` records which side signed off — Buildertrend
 * distinguishes an internal approval from the sub/vendor's own acceptance, and both
 * appear in the real export.
 *
 * A VENDOR approval freezes the agreement: whatever scopeOfWork read at this moment
 * is copied into agreementSnapshot, which is what "View agreement" renders from
 * thereafter. Editing scopeOfWork afterward requires amend(), which clears the
 * snapshot and re-opens approval — so the vendor can never be held to text that
 * changed after they accepted it.
 */
export async function approvePurchaseOrder(input: {
  readonly organizationId: string;
  readonly purchaseOrderId: string;
  readonly approvedBy: "INTERNAL" | "VENDOR";
  readonly vendorSignatureName?: string | null;
  readonly vendorSignatureIp?: string | null;
  readonly actor?: PurchaseOrderActor;
}) {
  const purchaseOrder = await loadPurchaseOrder(input.organizationId, input.purchaseOrderId);
  if (!canTransition(purchaseOrder.status, "APPROVED")) {
    throw new InvalidPurchaseOrderTransitionError(purchaseOrder.status, "APPROVED");
  }

  const now = new Date();
  const isVendor = input.approvedBy === "VENDOR";

  const updated = await db.purchaseOrder.update({
    where: { id: purchaseOrder.id },
    data: {
      status: "APPROVED",
      approvedAt: now,
      approvedBy: input.approvedBy,
      declinedAt: null,
      ...(isVendor
        ? {
            vendorSignatureName: input.vendorSignatureName ?? null,
            vendorSignedAt: now,
            vendorSignatureIp: input.vendorSignatureIp ?? null,
            agreementSnapshot: purchaseOrder.scopeOfWork,
            agreementSnapshotAt: now,
          }
        : {}),
    },
  });

  await recordEvent(
    purchaseOrder.id,
    "APPROVED",
    updated.version,
    input.actor ?? {},
    isVendor ? `Accepted by ${input.vendorSignatureName ?? purchaseOrder.vendorName}` : "Approved internally",
  );
  await emitEvent(input.organizationId, "po.approved", {
    purchaseOrderId: updated.id,
    jobId: updated.jobId,
    poNumber: updated.poNumber,
    approvedBy: input.approvedBy,
  });
  return updated;
}

export async function declinePurchaseOrder(input: {
  readonly organizationId: string;
  readonly purchaseOrderId: string;
  readonly reason?: string | null;
  readonly actor?: PurchaseOrderActor;
}) {
  const purchaseOrder = await loadPurchaseOrder(input.organizationId, input.purchaseOrderId);
  if (!canTransition(purchaseOrder.status, "DECLINED")) {
    throw new InvalidPurchaseOrderTransitionError(purchaseOrder.status, "DECLINED");
  }

  const updated = await db.purchaseOrder.update({
    where: { id: purchaseOrder.id },
    data: { status: "DECLINED", declinedAt: new Date() },
  });
  await recordEvent(purchaseOrder.id, "DECLINED", updated.version, input.actor ?? {}, input.reason);
  await emitEvent(input.organizationId, "po.declined", {
    purchaseOrderId: updated.id,
    jobId: updated.jobId,
    poNumber: updated.poNumber,
    reason: input.reason ?? null,
  });
  return updated;
}

/**
 * Revise an approved PO. Bumps the version, drops it back to PENDING_APPROVAL, and
 * clears the frozen agreement so the vendor has to accept the new terms — an amended
 * PO is a new offer, not an edit to one already agreed.
 *
 * Line items are left alone here; the caller edits those separately. The point of
 * amend() is the status/version/snapshot bookkeeping around that edit.
 */
export async function amendPurchaseOrder(input: {
  readonly organizationId: string;
  readonly purchaseOrderId: string;
  readonly reason?: string | null;
  readonly actor?: PurchaseOrderActor;
}) {
  const purchaseOrder = await loadPurchaseOrder(input.organizationId, input.purchaseOrderId);
  if (purchaseOrder.status === "CANCELLED") {
    throw new InvalidPurchaseOrderTransitionError(purchaseOrder.status, "PENDING_APPROVAL");
  }

  const updated = await db.purchaseOrder.update({
    where: { id: purchaseOrder.id },
    data: {
      version: { increment: 1 },
      status: "PENDING_APPROVAL",
      approvedAt: null,
      approvedBy: null,
      declinedAt: null,
      vendorSignatureName: null,
      vendorSignedAt: null,
      vendorSignatureIp: null,
      agreementSnapshot: null,
      agreementSnapshotAt: null,
    },
  });
  await recordEvent(purchaseOrder.id, "AMENDED", updated.version, input.actor ?? {}, input.reason);
  await emitEvent(input.organizationId, "po.amended", {
    purchaseOrderId: updated.id,
    jobId: updated.jobId,
    poNumber: updated.poNumber,
    version: updated.version,
    reason: input.reason ?? null,
  });
  return updated;
}

/**
 * Recall (void) a PO. Terminal — the funnel stops counting it as committed the
 * moment this lands, which is the whole point: a recalled PO isn't money owed.
 */
export async function recallPurchaseOrder(input: {
  readonly organizationId: string;
  readonly purchaseOrderId: string;
  readonly reason?: string | null;
  readonly actor?: PurchaseOrderActor;
}) {
  const purchaseOrder = await loadPurchaseOrder(input.organizationId, input.purchaseOrderId);
  if (!canTransition(purchaseOrder.status, "CANCELLED")) {
    throw new InvalidPurchaseOrderTransitionError(purchaseOrder.status, "CANCELLED");
  }

  const updated = await db.purchaseOrder.update({
    where: { id: purchaseOrder.id },
    data: { status: "CANCELLED", recalledAt: new Date() },
  });
  await recordEvent(purchaseOrder.id, "RECALLED", updated.version, input.actor ?? {}, input.reason);
  await emitEvent(input.organizationId, "po.recalled", {
    purchaseOrderId: updated.id,
    jobId: updated.jobId,
    poNumber: updated.poNumber,
    reason: input.reason ?? null,
  });
  return updated;
}

/**
 * Flip the work-status axis. Deliberately leaves `status` alone — see this file's
 * header for why finishing the work doesn't change what the job is committed to.
 */
export async function setWorkStatus(input: {
  readonly organizationId: string;
  readonly purchaseOrderId: string;
  readonly workComplete: boolean;
  readonly actor?: PurchaseOrderActor;
}) {
  const purchaseOrder = await loadPurchaseOrder(input.organizationId, input.purchaseOrderId);

  const updated = await db.purchaseOrder.update({
    where: { id: purchaseOrder.id },
    data: {
      workStatus: input.workComplete ? "WORK_COMPLETE" : "NOT_COMPLETE",
      completedOn: input.workComplete ? new Date() : null,
    },
  });
  await recordEvent(
    purchaseOrder.id,
    input.workComplete ? "WORK_MARKED_COMPLETE" : "WORK_REOPENED",
    updated.version,
    input.actor ?? {},
  );
  return updated;
}

/**
 * What a PO is worth, how much of it has been billed, and what's left — the numbers
 * behind the detail view's payment progress bar.
 *
 * Billed counts every non-void bill against the PO, so a bill sitting in review
 * already eats into the outstanding figure. That's intentional: the office wants to
 * see money the vendor has claimed, not just money already paid. Outstanding floors
 * at zero, since a PO billed past its face value isn't owed a negative amount.
 */
export interface PurchaseOrderProgress {
  readonly committedCents: number;
  readonly billedCents: number;
  readonly paidCents: number;
  readonly outstandingCents: number;
  /** 0–100, of committed. 0 when the PO is worth nothing, rather than NaN. */
  readonly billedPercent: number;
}

export async function purchaseOrderProgress(
  organizationId: string,
  purchaseOrderId: string,
): Promise<PurchaseOrderProgress> {
  const purchaseOrder = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId },
    include: {
      lineItems: { select: { quantityMilli: true, unitCostCents: true } },
      bills: {
        select: { approvalStatus: true, lineItems: { select: { amountCents: true } } },
      },
    },
  });
  if (!purchaseOrder) throw new PurchaseOrderNotFoundError(purchaseOrderId);

  const committedCents = purchaseOrder.lineItems.reduce(
    (total, item) => total + extendedCostCents(item.quantityMilli, item.unitCostCents),
    0,
  );

  // Bill lines carry a flat amountCents (unlike PO lines, which are qty × unit cost).
  const billTotal = (bill: { lineItems: readonly { amountCents: number }[] }) =>
    bill.lineItems.reduce((total, item) => total + item.amountCents, 0);

  const billedCents = purchaseOrder.bills
    .filter((bill) => bill.approvalStatus !== "VOID")
    .reduce((total, bill) => total + billTotal(bill), 0);

  const paidCents = purchaseOrder.bills
    .filter((bill) => bill.approvalStatus === "PAID")
    .reduce((total, bill) => total + billTotal(bill), 0);

  return {
    committedCents,
    billedCents,
    paidCents,
    outstandingCents: Math.max(0, committedCents - billedCents),
    billedPercent: committedCents === 0 ? 0 : Math.round((billedCents / committedCents) * 100),
  };
}
