"use server";

import { revalidatePath } from "next/cache";

import { setBillApprovers } from "@/lib/bills/intake";
import { applyLienWaiver } from "@/lib/bills/lien-waivers";
import {
  createBill,
  InventedBillNumberError,
  JobNotFoundError,
  JobNotOpenError,
  PurchaseOrderJobMismatchError,
  UnknownCostCodeError,
  UnknownPurchaseOrderError,
  UnknownScheduleItemError,
  UnknownVendorError,
} from "@/lib/bills/service";
import { requireAppUser } from "@/lib/auth";
import { extendedCostCents } from "@/lib/budget/funnel";
import { isQuickBooksBillPushEnabled } from "@/lib/env";
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";
import { QuickBooksApiError, QuickBooksNotConfiguredError } from "@/lib/quickbooks/client";
import { QuickBooksNotConnectedError } from "@/lib/quickbooks/connection-service";
import {
  BillHasNoVendorError,
  BillQuickBooksDuplicateBlockedError,
  BillQuickBooksInvoiceNumberError,
  BillQuickBooksPushNotReadyError,
  BillQuickBooksPushPausedError,
  BillQuickBooksPushUnsafeStatusError,
  BillQuickBooksSyncDeclinedError,
  syncBillToQuickBooks,
} from "@/lib/quickbooks/sync/bills";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly billId?: string;
}

function parseOptionalDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(`${trimmed}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const LIEN_KIND_TO_TEMPLATE: Record<string, string> = {
  conditional: "Conditional",
  unconditional: "Unconditional",
  final: "Final unconditional",
};

export async function createBillAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const vendorId = String(formData.get("vendorId") ?? "").trim() || null;
  const vendorName = String(formData.get("vendorName") ?? "").trim();
  const billNumber = String(formData.get("billNumber") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "").trim() || null;
  const issuedOn = parseOptionalDate(String(formData.get("issuedOn") ?? ""));
  const dueOn = parseOptionalDate(String(formData.get("dueOn") ?? ""));
  const completionMode = String(formData.get("completionMode") ?? "") === "schedule" ? "schedule" : "none";
  const linkedScheduleItemId =
    completionMode === "schedule" ? String(formData.get("linkedScheduleItemId") ?? "").trim() || null : null;

  const saveIntentRaw = String(formData.get("saveIntent") ?? "job").trim();
  const saveIntent = saveIntentRaw === "draft" || saveIntentRaw === "ready" ? saveIntentRaw : "job";
  const sendRaw = String(formData.get("sendToQuickBooks") ?? "").trim();
  const sendToQuickBooks = sendRaw === "true" ? true : sendRaw === "false" ? false : null;
  const billableToClient = String(formData.get("billableToClient") ?? "") === "true";
  const quickBooksSkipReason =
    sendToQuickBooks === false ? String(formData.get("quickBooksSkipReason") ?? "").trim() || "Skipped QuickBooks on create" : null;
  const approverIds = String(formData.get("approverIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const lienKinds = String(formData.get("lienWaiverKinds") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!vendorName) return { error: "Vendor name is required." };

  try {
    const lineItems = parseCostCodeLineItems(formData).map((item) => ({
      costCodeId: item.costCodeId,
      title: item.title,
      amountCents: extendedCostCents(item.quantityMilli, item.unitCostCents),
      ...(item.costType ? { costType: item.costType } : {}),
    }));
    if (lineItems.length === 0) return { error: "Add at least one line item." };

    const approvalStatus = saveIntent === "ready" ? "READY_FOR_PAYMENT" : "IN_REVIEW";

    const created = await createBill({
      organizationId: user.organizationId,
      jobId,
      vendorName,
      vendorId,
      billNumber: billNumber || null,
      title,
      description,
      purchaseOrderId,
      issuedOn,
      dueOn,
      linkedScheduleItemId,
      createdByUserId: user.id,
      sendToQuickBooks,
      quickBooksSkipReason,
      billableToClient,
      approvalStatus,
      lineItems,
    });

    if (approverIds.length > 0) {
      await setBillApprovers({
        organizationId: user.organizationId,
        billId: created.id,
        approverUserIds: approverIds,
      });
    }

    // First selected lien kind wins for the single LienWaiver row (v1 model).
    const firstLien = lienKinds[0];
    if (firstLien) {
      const templateName = LIEN_KIND_TO_TEMPLATE[firstLien] ?? "Conditional";
      await applyLienWaiver({
        organizationId: user.organizationId,
        billId: created.id,
        templateName,
      });
    }

    // "Immediately upon save" only attempts a live push when Ready + intent true + global pause off.
    if (saveIntent === "ready" && sendToQuickBooks === true && isQuickBooksBillPushEnabled()) {
      try {
        await syncBillToQuickBooks(user.organizationId, created.id);
      } catch (error) {
        if (
          error instanceof QuickBooksNotConfiguredError ||
          error instanceof QuickBooksNotConnectedError ||
          error instanceof BillHasNoVendorError ||
          error instanceof BillQuickBooksPushPausedError ||
          error instanceof BillQuickBooksPushUnsafeStatusError ||
          error instanceof BillQuickBooksPushNotReadyError ||
          error instanceof BillQuickBooksInvoiceNumberError ||
          error instanceof BillQuickBooksDuplicateBlockedError ||
          error instanceof BillQuickBooksSyncDeclinedError ||
          error instanceof QuickBooksApiError
        ) {
          // Intent is already stored; do not fail the create — list/detail show QB status.
          revalidatePath(`/jobs/${jobId}/bills`);
          return { ok: true, billId: created.id };
        }
        throw error;
      }
    }

    revalidatePath(`/jobs/${jobId}/bills`);
    return { ok: true, billId: created.id };
  } catch (error) {
    if (
      error instanceof JobNotFoundError ||
      error instanceof JobNotOpenError ||
      error instanceof UnknownPurchaseOrderError ||
      error instanceof PurchaseOrderJobMismatchError ||
      error instanceof UnknownVendorError ||
      error instanceof UnknownScheduleItemError ||
      error instanceof InventedBillNumberError
    ) {
      return { error: error.message };
    }
    if (error instanceof UnknownCostCodeError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }
}

/** Explicit "Sync to QuickBooks" action (CLAUDE.md 2.3) — same pattern as invoice/vendor sync. */
export async function syncBillToQuickBooksAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");

  try {
    await syncBillToQuickBooks(user.organizationId, billId);
  } catch (error) {
    if (
      error instanceof QuickBooksNotConfiguredError ||
      error instanceof QuickBooksNotConnectedError ||
      error instanceof BillHasNoVendorError ||
      error instanceof BillQuickBooksPushPausedError ||
      error instanceof BillQuickBooksPushUnsafeStatusError ||
      error instanceof BillQuickBooksPushNotReadyError ||
      error instanceof BillQuickBooksInvoiceNumberError ||
      error instanceof BillQuickBooksDuplicateBlockedError ||
      error instanceof BillQuickBooksSyncDeclinedError ||
      error instanceof QuickBooksApiError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/bills`);
  return { ok: true };
}
