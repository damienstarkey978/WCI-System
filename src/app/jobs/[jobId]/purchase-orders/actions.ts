"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";
import {
  PurchaseOrderVendorMissingError,
  sendPurchaseOrderToVendor,
} from "@/lib/purchase-orders/deliver";
import { nextAutoPoNumber } from "@/lib/purchase-orders/po-number";
import {
  createPurchaseOrder,
  DuplicatePoNumberError,
  JobNotFoundError,
  JobNotOpenError,
  UnknownCostCodeError,
  UnknownVendorError,
} from "@/lib/purchase-orders/service";
import {
  amendPurchaseOrder,
  approvePurchaseOrder,
  declinePurchaseOrder,
  InvalidPurchaseOrderTransitionError,
  PurchaseOrderNotFoundError,
  recallPurchaseOrder,
  setWorkStatus,
} from "@/lib/purchase-orders/workflow";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly purchaseOrderId?: string;
  readonly acceptUrl?: string;
  readonly emailed?: boolean;
  readonly needsManualDelivery?: boolean;
}

function parseOptionalDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function createPurchaseOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const intent = String(formData.get("intent") ?? "save") === "send" ? "send" : "save";
  let poNumber = String(formData.get("poNumber") ?? "").trim();
  const vendorId = String(formData.get("vendorId") ?? "").trim() || null;
  const vendorName = String(formData.get("vendorName") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const materialsOnly = String(formData.get("materialsOnly") ?? "") === "true";
  const scopeOfWork = String(formData.get("scopeOfWork") ?? "").trim() || null;
  const internalNotes = String(formData.get("internalNotes") ?? "").trim() || null;
  const scheduledCompletionOn = parseOptionalDate(String(formData.get("scheduledCompletionOn") ?? ""));
  const completedOn = parseOptionalDate(String(formData.get("completedOn") ?? ""));

  if (!poNumber) {
    poNumber = await nextAutoPoNumber(user.organizationId);
  }
  if (!vendorId && !vendorName) return { error: "Assign this purchase order to a vendor." };
  if (intent === "send" && !vendorId) {
    return { error: "Pick a vendor with a portal account before sending for approval." };
  }

  let purchaseOrderId: string;
  try {
    const lineItems = parseCostCodeLineItems(formData);
    if (lineItems.length === 0) return { error: "Add at least one line item." };

    const created = await createPurchaseOrder({
      organizationId: user.organizationId,
      jobId,
      poNumber,
      vendorName: vendorName || "Vendor",
      vendorId,
      title: title || null,
      materialsOnly,
      scheduledCompletionOn,
      completedOn,
      scopeOfWork,
      internalNotes,
      lineItems,
    });
    purchaseOrderId = created.id;
  } catch (error) {
    if (
      error instanceof JobNotFoundError ||
      error instanceof JobNotOpenError ||
      error instanceof DuplicatePoNumberError ||
      error instanceof UnknownVendorError
    ) {
      return { error: error.message };
    }
    if (error instanceof UnknownCostCodeError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/purchase-orders`);

  if (intent === "save") {
    return { ok: true, purchaseOrderId };
  }

  try {
    const delivery = await sendPurchaseOrderToVendor({
      organizationId: user.organizationId,
      purchaseOrderId,
      actor: { actorUserId: user.id },
    });
    revalidatePath(`/jobs/${jobId}/purchase-orders/${purchaseOrderId}`);
    return {
      ok: true,
      purchaseOrderId,
      acceptUrl: delivery.acceptUrl,
      emailed: delivery.emailed,
      needsManualDelivery: delivery.needsManualDelivery,
      ...(delivery.emailError && delivery.needsManualDelivery
        ? { error: undefined }
        : {}),
    };
  } catch (error) {
    if (error instanceof PurchaseOrderVendorMissingError || error instanceof InvalidPurchaseOrderTransitionError) {
      return {
        ok: true,
        purchaseOrderId,
        error: `Purchase order saved, but could not send: ${error.message}`,
      };
    }
    throw error;
  }
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

/** Send (or re-send) an existing draft/declined PO — issues accept link + emails when possible. */
export async function sendForApprovalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "");

  try {
    const delivery = await sendPurchaseOrderToVendor({
      organizationId: user.organizationId,
      purchaseOrderId,
      actor: { actorUserId: user.id },
    });
    revalidatePath(`/jobs/${jobId}/purchase-orders`);
    revalidatePath(`/jobs/${jobId}/purchase-orders/${purchaseOrderId}`);
    return {
      ok: true,
      purchaseOrderId,
      acceptUrl: delivery.acceptUrl,
      emailed: delivery.emailed,
      needsManualDelivery: delivery.needsManualDelivery,
      ...(delivery.needsManualDelivery && !delivery.emailed
        ? {
            error: delivery.emailError
              ? `${delivery.emailError} Accept link: ${delivery.acceptUrl}`
              : `Email not sent — share this accept link: ${delivery.acceptUrl}`,
          }
        : {}),
    };
  } catch (error) {
    if (
      error instanceof PurchaseOrderNotFoundError ||
      error instanceof InvalidPurchaseOrderTransitionError ||
      error instanceof PurchaseOrderVendorMissingError
    ) {
      return { error: error.message };
    }
    throw error;
  }
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
