"use server";

import { revalidatePath } from "next/cache";

import {
  createBill,
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
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";
import { QuickBooksApiError, QuickBooksNotConfiguredError } from "@/lib/quickbooks/client";
import { QuickBooksNotConnectedError } from "@/lib/quickbooks/connection-service";
import {
  BillHasNoVendorError,
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

  if (!vendorName) return { error: "Vendor name is required." };

  try {
    const lineItems = parseCostCodeLineItems(formData).map((item) => ({
      costCodeId: item.costCodeId,
      title: item.title,
      amountCents: extendedCostCents(item.quantityMilli, item.unitCostCents),
      ...(item.costType ? { costType: item.costType } : {}),
    }));
    if (lineItems.length === 0) return { error: "Add at least one line item." };

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
      lineItems,
    });

    revalidatePath(`/jobs/${jobId}/bills`);
    return { ok: true, billId: created.id };
  } catch (error) {
    if (
      error instanceof JobNotFoundError ||
      error instanceof JobNotOpenError ||
      error instanceof UnknownPurchaseOrderError ||
      error instanceof PurchaseOrderJobMismatchError ||
      error instanceof UnknownVendorError ||
      error instanceof UnknownScheduleItemError
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
