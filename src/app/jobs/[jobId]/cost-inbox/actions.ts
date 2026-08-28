"use server";

import { revalidatePath } from "next/cache";

import { BillApprovalStatus } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { BillNotFoundError, IllegalBillTransitionError, updateBillStatus } from "@/lib/bills/service";

export async function approveCostInboxBillAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");

  try {
    await updateBillStatus(user.organizationId, billId, BillApprovalStatus.APPROVED);
  } catch (error) {
    if (error instanceof BillNotFoundError || error instanceof IllegalBillTransitionError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/cost-inbox`);
}

export async function voidCostInboxBillAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const billId = String(formData.get("billId") ?? "");

  try {
    await updateBillStatus(user.organizationId, billId, BillApprovalStatus.VOID);
  } catch (error) {
    if (error instanceof BillNotFoundError || error instanceof IllegalBillTransitionError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/cost-inbox`);
}
