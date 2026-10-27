"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AiNotConfiguredError, DraftGenerationError } from "@/lib/ai/takeoff-assistant";
import { createAiTakeoffDraft, JobNotFoundError, NoCostCodesError } from "@/lib/ai/takeoff-service";
import { currentAppUser } from "@/lib/auth";
import { nextAutoPoNumber } from "@/lib/purchase-orders/po-number";
import { DuplicatePoNumberError } from "@/lib/purchase-orders/service";
import {
  pushTakeoffToPurchaseOrder,
  queueTakeoffForPurchasing,
  TakeoffLineNotFoundError,
  TakeoffLinesNotConvertibleError,
  TakeoffNotFoundError,
} from "@/lib/takeoffs/service";

export type ActionState = { error?: string; ok?: boolean };

export async function draftTakeoffWithAiAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentAppUser();
  if (!user) return { error: "Not signed in." };

  const jobId = String(formData.get("jobId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!jobId) return { error: "Missing job." };
  if (notes.length < 10) return { error: "Add at least a short description of the plans or measurements." };

  try {
    const result = await createAiTakeoffDraft({
      organizationId: user.organizationId,
      jobId,
      notes,
    });
    revalidatePath(`/jobs/${jobId}/takeoffs`);
    revalidatePath(`/jobs/${jobId}/purchasing`);
    redirect(`/jobs/${jobId}/takeoffs/${result.takeoffId}`);
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    if (error instanceof NoCostCodesError) return { error: error.message };
    if (error instanceof AiNotConfiguredError) {
      return { error: "AI takeoffs need ANTHROPIC_API_KEY configured." };
    }
    if (error instanceof DraftGenerationError) return { error: error.message };
    throw error;
  }
}

export async function queueTakeoffPurchasingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentAppUser();
  if (!user) return { error: "Not signed in." };

  const jobId = String(formData.get("jobId") ?? "");
  const takeoffId = String(formData.get("takeoffId") ?? "");
  const vendorHint = String(formData.get("vendorHint") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const lineIds = formData.getAll("lineId").map(String).filter(Boolean);

  if (!jobId || !takeoffId) return { error: "Missing takeoff." };

  try {
    await queueTakeoffForPurchasing({
      organizationId: user.organizationId,
      takeoffId,
      lineIds: lineIds.length > 0 ? lineIds : undefined,
      vendorHint,
      notes,
    });
    revalidatePath(`/jobs/${jobId}/takeoffs`);
    revalidatePath(`/jobs/${jobId}/takeoffs/${takeoffId}`);
    revalidatePath(`/jobs/${jobId}/purchasing`);
    return { ok: true };
  } catch (error) {
    if (
      error instanceof TakeoffNotFoundError ||
      error instanceof TakeoffLineNotFoundError ||
      error instanceof TakeoffLinesNotConvertibleError
    ) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function pushTakeoffToPoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentAppUser();
  if (!user) return { error: "Not signed in." };

  const jobId = String(formData.get("jobId") ?? "");
  const takeoffId = String(formData.get("takeoffId") ?? "");
  const vendorName = String(formData.get("vendorName") ?? "").trim();
  const lineIds = formData.getAll("lineId").map(String).filter(Boolean);

  if (!jobId || !takeoffId) return { error: "Missing takeoff." };
  if (!vendorName) return { error: "Vendor name is required." };

  try {
    const poNumber = await nextAutoPoNumber(user.organizationId);
    const po = await pushTakeoffToPurchaseOrder({
      organizationId: user.organizationId,
      takeoffId,
      poNumber,
      vendorName,
      lineIds: lineIds.length > 0 ? lineIds : undefined,
    });
    revalidatePath(`/jobs/${jobId}/takeoffs`);
    revalidatePath(`/jobs/${jobId}/takeoffs/${takeoffId}`);
    revalidatePath(`/jobs/${jobId}/purchasing`);
    revalidatePath(`/jobs/${jobId}/purchase-orders`);
    redirect(`/jobs/${jobId}/purchase-orders/${po.id}`);
  } catch (error) {
    if (
      error instanceof TakeoffNotFoundError ||
      error instanceof TakeoffLineNotFoundError ||
      error instanceof TakeoffLinesNotConvertibleError ||
      error instanceof DuplicatePoNumberError
    ) {
      return { error: error.message };
    }
    throw error;
  }
}
