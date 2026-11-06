"use server";

import { revalidatePath } from "next/cache";

import { ChangeOrderMode, RateMode } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import {
  ChangeOrderClientMissingError,
  sendChangeOrderForApproval,
} from "@/lib/change-orders/deliver";
import {
  approveChangeOrder,
  ChangeOrderNotApprovedError,
  ChangeOrderNotFoundError,
  ChangeOrderNotPendingError,
  createChangeOrder,
  declineChangeOrder,
  EmptyChangeOrderError,
  JobNotFoundError,
  JobNotOpenError,
  markChangeOrderSent,
  pushChangeOrderToPurchaseOrder,
  recallChangeOrder,
  replaceChangeOrderLines,
  setChangeOrderFlat,
  updateChangeOrder,
} from "@/lib/change-orders/service";
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";
import { parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/money";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly changeOrderId?: string;
  readonly purchaseOrderId?: string;
  readonly approvalUrl?: string;
  readonly emailed?: boolean;
  readonly needsManualDelivery?: boolean;
}

export async function createChangeOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const mode = String(formData.get("mode") ?? "FLAT") === "ITEMIZED" ? ChangeOrderMode.ITEMIZED : ChangeOrderMode.FLAT;
  const deadlineRaw = String(formData.get("deadline") ?? "");
  const notesBuilder = String(formData.get("notesBuilder") ?? "").trim() || null;
  const notesClient = String(formData.get("notesClient") ?? "").trim() || null;
  const invoiceOnApproval = formData.get("invoiceOnApproval") === "on";

  if (!title) return { error: "Title is required." };

  try {
    let created;
    if (mode === ChangeOrderMode.FLAT) {
      const flatCostCodeId = String(formData.get("flatCostCodeId") ?? "");
      const flatCostRaw = String(formData.get("flatCost") ?? "");
      const flatClientPriceRaw = String(formData.get("flatClientPrice") ?? "");
      if (!flatCostCodeId) return { error: "Choose a cost code." };
      if (!flatCostRaw || !flatClientPriceRaw) return { error: "Cost and client price are required." };

      created = await createChangeOrder({
        organizationId: user.organizationId,
        jobId,
        title,
        mode,
        flatCostCodeId,
        flatCostCents: parseDollarsToCents(flatCostRaw),
        flatClientPriceCents: parseDollarsToCents(flatClientPriceRaw),
        deadline: deadlineRaw ? new Date(`${deadlineRaw}T00:00:00Z`) : null,
        notesBuilder,
        notesClient,
        invoiceOnApproval,
      });
    } else {
      const rateMode = String(formData.get("rateMode") ?? "MARKUP") === "MARGIN" ? RateMode.MARGIN : RateMode.MARKUP;
      const rateBasisPoints = parsePercentToBasisPoints(String(formData.get("rate") ?? "0") || "0");
      const lineItems = parseCostCodeLineItems(formData).map((item) => ({ ...item, rateMode, rateBasisPoints }));
      if (lineItems.length === 0) return { error: "Add at least one line item." };

      created = await createChangeOrder({
        organizationId: user.organizationId,
        jobId,
        title,
        mode,
        lineItems,
        deadline: deadlineRaw ? new Date(`${deadlineRaw}T00:00:00Z`) : null,
        notesBuilder,
        notesClient,
        invoiceOnApproval,
      });
    }

    revalidatePath(`/jobs/${jobId}/change-orders`);
    return { ok: true, changeOrderId: created.id };
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof JobNotOpenError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }
}

export async function updateChangeOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const deadlineRaw = String(formData.get("deadline") ?? "");

  try {
    await updateChangeOrder({
      organizationId: user.organizationId,
      changeOrderId,
      title,
      deadline: deadlineRaw ? new Date(`${deadlineRaw}T00:00:00Z`) : null,
      notesBuilder: String(formData.get("notesBuilder") ?? "").trim() || null,
      notesClient: String(formData.get("notesClient") ?? "").trim() || null,
      invoiceOnApproval: formData.get("invoiceOnApproval") === "on",
    });
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError || error instanceof ChangeOrderNotPendingError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
  revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
  return { ok: true };
}

export async function replaceChangeOrderLinesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  const rateMode = String(formData.get("rateMode") ?? "MARKUP") === "MARGIN" ? RateMode.MARGIN : RateMode.MARKUP;
  const rateBasisPoints = parsePercentToBasisPoints(String(formData.get("rate") ?? "0") || "0");
  const lineItems = parseCostCodeLineItems(formData).map((item) => ({ ...item, rateMode, rateBasisPoints }));
  if (lineItems.length === 0) return { error: "Add at least one line item." };

  try {
    await replaceChangeOrderLines({
      organizationId: user.organizationId,
      changeOrderId,
      lineItems,
    });
  } catch (error) {
    if (
      error instanceof ChangeOrderNotFoundError ||
      error instanceof ChangeOrderNotPendingError ||
      error instanceof EmptyChangeOrderError
    ) {
      return { error: error.message };
    }
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
  revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
  return { ok: true };
}

export async function setChangeOrderFlatAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  const flatCostCodeId = String(formData.get("flatCostCodeId") ?? "");
  const flatCostRaw = String(formData.get("flatCost") ?? "");
  const flatClientPriceRaw = String(formData.get("flatClientPrice") ?? "");
  if (!flatCostCodeId) return { error: "Choose a cost code." };
  if (!flatCostRaw || !flatClientPriceRaw) return { error: "Cost and client price are required." };

  try {
    await setChangeOrderFlat({
      organizationId: user.organizationId,
      changeOrderId,
      flatCostCodeId,
      flatCostCents: parseDollarsToCents(flatCostRaw),
      flatClientPriceCents: parseDollarsToCents(flatClientPriceRaw),
    });
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError || error instanceof ChangeOrderNotPendingError) {
      return { error: error.message };
    }
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
  revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
  return { ok: true };
}

/** Internal status flip only (no link / email). Prefer sendChangeOrderForApprovalAction. */
export async function markChangeOrderSentAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  try {
    await markChangeOrderSent(user.organizationId, changeOrderId);
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError || error instanceof ChangeOrderNotPendingError) return;
    throw error;
  }
  revalidatePath(`/jobs/${jobId}/change-orders`);
  revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
}

/**
 * Buildertrend "Send to client for approval" — mark pending, issue e-sign link,
 * email when configured. Never pushes QuickBooks.
 */
export async function sendChangeOrderForApprovalAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");

  try {
    const result = await sendChangeOrderForApproval({
      organizationId: user.organizationId,
      changeOrderId,
    });
    revalidatePath(`/jobs/${jobId}/change-orders`);
    revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
    return {
      ok: true,
      changeOrderId,
      approvalUrl: result.approvalUrl,
      emailed: result.emailed,
      needsManualDelivery: result.needsManualDelivery,
      ...(result.emailError ? { error: result.emailError } : {}),
    };
  } catch (error) {
    if (
      error instanceof ChangeOrderNotFoundError ||
      error instanceof ChangeOrderNotPendingError ||
      error instanceof ChangeOrderClientMissingError
    ) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function recallChangeOrderAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  try {
    await recallChangeOrder(user.organizationId, changeOrderId);
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError || error instanceof ChangeOrderNotPendingError) return;
    throw error;
  }
  revalidatePath(`/jobs/${jobId}/change-orders`);
  revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
}

export async function approveChangeOrderAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");

  try {
    await approveChangeOrder({ organizationId: user.organizationId, changeOrderId });
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError || error instanceof ChangeOrderNotPendingError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
  revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
}

export async function declineChangeOrderAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");

  try {
    await declineChangeOrder(user.organizationId, changeOrderId);
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError || error instanceof ChangeOrderNotPendingError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
  revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
}

export async function pushChangeOrderToPoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");
  const poNumber = String(formData.get("poNumber") ?? "").trim();
  const vendorName = String(formData.get("vendorName") ?? "").trim();
  if (!poNumber) return { error: "PO number is required." };
  if (!vendorName) return { error: "Vendor name is required." };

  try {
    const po = await pushChangeOrderToPurchaseOrder(user.organizationId, changeOrderId, poNumber, vendorName);
    revalidatePath(`/jobs/${jobId}/change-orders`);
    revalidatePath(`/jobs/${jobId}/change-orders/${changeOrderId}`);
    revalidatePath(`/jobs/${jobId}/purchase-orders`);
    return { ok: true, purchaseOrderId: po.id };
  } catch (error) {
    if (
      error instanceof ChangeOrderNotFoundError ||
      error instanceof ChangeOrderNotApprovedError ||
      error instanceof ChangeOrderNotPendingError
    ) {
      return { error: error.message };
    }
    throw error;
  }
}
