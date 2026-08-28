"use server";

import { revalidatePath } from "next/cache";

import { createBill, JobNotFoundError, JobNotOpenError, UnknownCostCodeError, UnknownPurchaseOrderError } from "@/lib/bills/service";
import { requireAppUser } from "@/lib/auth";
import { extendedCostCents } from "@/lib/budget/funnel";
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createBillAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const vendorName = String(formData.get("vendorName") ?? "").trim();
  const billNumber = String(formData.get("billNumber") ?? "").trim();
  const purchaseOrderId = String(formData.get("purchaseOrderId") ?? "").trim();

  if (!vendorName) return { error: "Vendor name is required." };

  try {
    const lineItems = parseCostCodeLineItems(formData).map((item) => ({
      costCodeId: item.costCodeId,
      title: item.title,
      amountCents: extendedCostCents(item.quantityMilli, item.unitCostCents),
    }));
    if (lineItems.length === 0) return { error: "Add at least one line item." };

    await createBill({
      organizationId: user.organizationId,
      jobId,
      vendorName,
      billNumber: billNumber || null,
      purchaseOrderId: purchaseOrderId || null,
      lineItems,
    });
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof JobNotOpenError || error instanceof UnknownPurchaseOrderError) {
      return { error: error.message };
    }
    if (error instanceof UnknownCostCodeError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/bills`);
  return { ok: true };
}
