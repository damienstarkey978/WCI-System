"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { EstimateNotEditableError, EstimateNotFoundError, reorderEstimateLineItems } from "@/lib/estimates/service";

export type ReorderActionState = { error?: string; ok?: boolean };

export async function reorderEstimateLineItemsAction(
  _previous: ReorderActionState,
  formData: FormData,
): Promise<ReorderActionState> {
  const user = await requireAppUser();
  const estimateId = String(formData.get("estimateId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "").trim() || null;
  const orderedRaw = String(formData.get("orderedIds") ?? "");
  let orderedIds: string[] = [];
  try {
    const parsed = JSON.parse(orderedRaw) as unknown;
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) {
      return { error: "Invalid reorder payload." };
    }
    orderedIds = parsed;
  } catch {
    return { error: "Invalid reorder payload." };
  }

  try {
    await reorderEstimateLineItems(user.organizationId, estimateId, orderedIds);
  } catch (error) {
    if (error instanceof EstimateNotFoundError || error instanceof EstimateNotEditableError) {
      return { error: error.message };
    }
    if (error instanceof Error) return { error: error.message };
    throw error;
  }

  revalidatePath(`/leads/estimates/${estimateId}`);
  if (proposalId) revalidatePath(`/leads/proposals/${proposalId}`);
  return { ok: true };
}
