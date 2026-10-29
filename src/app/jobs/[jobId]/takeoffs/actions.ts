"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AiNotConfiguredError, DraftGenerationError } from "@/lib/ai/takeoff-assistant";
import {
  createAiTakeoffDraft,
  JobNotFoundError,
  NoCostCodesError,
  TakeoffNotEmptyForAiDraftError,
} from "@/lib/ai/takeoff-service";
import { currentAppUser, requireAppUser } from "@/lib/auth";
import {
  JobNotFoundError as FileJobNotFoundError,
  uploadAndRegisterFile,
} from "@/lib/files/service";
import { nextAutoPoNumber } from "@/lib/purchase-orders/po-number";
import { DuplicatePoNumberError } from "@/lib/purchase-orders/service";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";
import {
  attachPlanFilesToTakeoff,
  createBlankTakeoff,
  detachPlanFileFromTakeoff,
  linkUploadedPlanToTakeoff,
  pushTakeoffToPurchaseOrder,
  queueTakeoffForPurchasing,
  TakeoffFileNotFoundError,
  TakeoffJobNotFoundError,
  TakeoffLineNotFoundError,
  TakeoffLinesNotConvertibleError,
  TakeoffNotFoundError,
  updateTakeoffMeasurements,
} from "@/lib/takeoffs/service";

export type ActionState = { error?: string; ok?: boolean; importedCount?: number };

export async function draftTakeoffWithAiAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentAppUser();
  if (!user) return { error: "Not signed in." };

  const jobId = String(formData.get("jobId") ?? "");
  const takeoffId = String(formData.get("takeoffId") ?? "").trim() || undefined;
  const notes = String(formData.get("notes") ?? "").trim();
  if (!jobId) return { error: "Missing job." };
  if (notes.length < 10) return { error: "Add at least a short description of the plans or measurements." };

  try {
    const result = await createAiTakeoffDraft({
      organizationId: user.organizationId,
      jobId,
      notes,
      takeoffId,
    });
    revalidatePath(`/jobs/${jobId}/takeoffs`);
    revalidatePath(`/jobs/${jobId}/takeoffs/${result.takeoffId}`);
    revalidatePath(`/jobs/${jobId}/purchasing`);
    redirect(`/jobs/${jobId}/takeoffs/${result.takeoffId}`);
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    if (error instanceof NoCostCodesError) return { error: error.message };
    if (error instanceof TakeoffNotFoundError) return { error: error.message };
    if (error instanceof TakeoffNotEmptyForAiDraftError) return { error: error.message };
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

export async function createBlankTakeoffAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentAppUser();
  if (!user) return { error: "Not signed in." };

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!jobId) return { error: "Missing job." };

  try {
    const takeoff = await createBlankTakeoff({
      organizationId: user.organizationId,
      jobId,
      title: title || undefined,
      notes: notes || null,
    });
    revalidatePath(`/jobs/${jobId}/takeoffs`);
    redirect(`/jobs/${jobId}/takeoffs/${takeoff.id}`);
  } catch (error) {
    if (error instanceof TakeoffJobNotFoundError) return { error: error.message };
    throw error;
  }
}

export async function updateTakeoffMeasurementsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentAppUser();
  if (!user) return { error: "Not signed in." };

  const jobId = String(formData.get("jobId") ?? "");
  const takeoffId = String(formData.get("takeoffId") ?? "");
  const notes = String(formData.get("notes") ?? "");
  if (!jobId || !takeoffId) return { error: "Missing takeoff." };

  try {
    await updateTakeoffMeasurements({
      organizationId: user.organizationId,
      takeoffId,
      notes,
    });
    revalidatePath(`/jobs/${jobId}/takeoffs`);
    revalidatePath(`/jobs/${jobId}/takeoffs/${takeoffId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof TakeoffNotFoundError) return { error: error.message };
    throw error;
  }
}

export async function importPlansFromPlansAndSpecsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await currentAppUser();
  if (!user) return { error: "Not signed in." };

  const jobId = String(formData.get("jobId") ?? "");
  const takeoffId = String(formData.get("takeoffId") ?? "");
  const fileIds = formData.getAll("fileId").map(String).filter(Boolean);
  if (!jobId || !takeoffId) return { error: "Missing takeoff." };
  if (fileIds.length === 0) return { error: "Select at least one plan to import." };

  try {
    const attached = await attachPlanFilesToTakeoff({
      organizationId: user.organizationId,
      takeoffId,
      fileIds,
    });
    revalidatePath(`/jobs/${jobId}/takeoffs/${takeoffId}`);
    revalidatePath(`/jobs/${jobId}/plans-and-specs`);
    return { ok: true, importedCount: attached.length };
  } catch (error) {
    if (error instanceof TakeoffNotFoundError || error instanceof TakeoffFileNotFoundError) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function uploadPlanToTakeoffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const takeoffId = String(formData.get("takeoffId") ?? "");
  if (!jobId || !takeoffId) return { error: "Missing takeoff." };

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return { error: "Choose at least one plan file." };

  try {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const registered = await uploadAndRegisterFile({
        organizationId: user.organizationId,
        jobId,
        uploadedByUserId: user.id,
        fileName: file.name,
        bytes,
        mimeType: file.type || null,
        sizeBytes: file.size,
        category: "PLAN",
        clientVisible: formData.get("clientVisible") === "on",
        subVisible: formData.get("subVisible") === "on",
      });
      await linkUploadedPlanToTakeoff({
        organizationId: user.organizationId,
        takeoffId,
        fileId: registered.id,
      });
    }
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) return { error: error.message };
    if (error instanceof FileJobNotFoundError) return { error: error.message };
    if (error instanceof TakeoffNotFoundError || error instanceof TakeoffFileNotFoundError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/takeoffs/${takeoffId}`);
  revalidatePath(`/jobs/${jobId}/plans-and-specs`);
  revalidatePath(`/jobs/${jobId}/files`);
  return { ok: true };
}

export async function detachPlanFromTakeoffAction(formData: FormData): Promise<void> {
  const user = await currentAppUser();
  if (!user) return;

  const jobId = String(formData.get("jobId") ?? "");
  const takeoffId = String(formData.get("takeoffId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");
  if (!jobId || !takeoffId || !fileId) return;

  try {
    await detachPlanFileFromTakeoff({
      organizationId: user.organizationId,
      takeoffId,
      fileId,
    });
  } catch (error) {
    if (error instanceof TakeoffNotFoundError || error instanceof TakeoffFileNotFoundError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/takeoffs/${takeoffId}`);
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
