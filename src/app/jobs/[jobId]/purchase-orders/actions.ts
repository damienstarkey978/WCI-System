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
