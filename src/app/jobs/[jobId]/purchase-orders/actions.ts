"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";
import {
  createPurchaseOrder,
  DuplicatePoNumberError,
  JobNotFoundError,
  JobNotOpenError,
  UnknownCostCodeError,
} from "@/lib/purchase-orders/service";
import {
  amendPurchaseOrder,
  approvePurchaseOrder,
  declinePurchaseOrder,
  InvalidPurchaseOrderTransitionError,
  PurchaseOrderNotFoundError,
  recallPurchaseOrder,
  sendForApproval,
  setWorkStatus,
} from "@/lib/purchase-orders/workflow";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createPurchaseOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const poNumber = String(formData.get("poNumber") ?? "").trim();
  const vendorName = String(formData.get("vendorName") ?? "").trim();

  if (!poNumber) return { error: "PO number is required." };
  if (!vendorName) return { error: "Vendor name is required." };

  try {
    const lineItems = parseCostCodeLineItems(formData);
    if (lineItems.length === 0) return { error: "Add at least one line item." };

    await createPurchaseOrder({
      organizationId: user.organizationId,
      jobId,
      poNumber,
      vendorName,
      lineItems,
    });
  } catch (error) {
    if (
      error instanceof JobNotFoundError ||
      error instanceof JobNotOpenError ||
      error instanceof DuplicatePoNumberError
    ) {
      return { error: error.message };
    }
    if (error instanceof UnknownCostCodeError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/purchase-orders`);
  return { ok: true };
}

/**
 * The detail view's workflow buttons. Each one is a distinct server action rather
 * than one dispatcher taking an action name, so an accidental extra form field can
 * never turn a "mark work complete" click into a recall.
 *
 * Every one of these re-reads the PO through the org-scoped service functions, so a
 * doctored purchaseOrderId in the form body can't reach another org's data.
 */
async function runWorkflowAction(
  jobId: string,
  purchaseOrderId: string,
  run: (organizationId: string, actorUserId: string) => Promise<unknown>,
): Promise<ActionState> {
  const user = await requireAppUser();
  try {
    await run(user.organizationId, user.id);
  } catch (error) {
    if (error instanceof PurchaseOrderNotFoundError || error instanceof InvalidPurchaseOrderTransitionError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath(`/jobs/${jobId}/purchase-orders`);
  revalidatePath(`/jobs/${jobId}/purchase-orders/${purchaseOrderId}`);
  return { ok: true };
}

export async function sendForApprovalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  return runWorkflowAction(jobId, purchaseOrderId, (organizationId, actorUserId) =>
    sendForApproval({ organizationId, purchaseOrderId, actor: { actorUserId } }),
  );
}

/**
 * Staff-side approval only. The vendor's own acceptance comes through the vendor
 * portal, which is what sets approvedBy=VENDOR and freezes the agreement snapshot.
 */
export async function approveInternallyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  return runWorkflowAction(jobId, purchaseOrderId, (organizationId, actorUserId) =>
    approvePurchaseOrder({ organizationId, purchaseOrderId, approvedBy: "INTERNAL", actor: { actorUserId } }),
  );
}

export async function declineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  return runWorkflowAction(jobId, purchaseOrderId, (organizationId, actorUserId) =>
    declinePurchaseOrder({ organizationId, purchaseOrderId, reason, actor: { actorUserId } }),
  );
}

export async function amendAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  return runWorkflowAction(jobId, purchaseOrderId, (organizationId, actorUserId) =>
    amendPurchaseOrder({ organizationId, purchaseOrderId, reason, actor: { actorUserId } }),
  );
}

export async function recallAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  return runWorkflowAction(jobId, purchaseOrderId, (organizationId, actorUserId) =>
    recallPurchaseOrder({ organizationId, purchaseOrderId, reason, actor: { actorUserId } }),
  );
}

export async function setWorkStatusAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = String(formData.get("jobId") ?? "");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");
  const workComplete = String(formData.get("workComplete") ?? "") === "true";
  return runWorkflowAction(jobId, purchaseOrderId, (organizationId, actorUserId) =>
    setWorkStatus({ organizationId, purchaseOrderId, workComplete, actor: { actorUserId } }),
  );
}
