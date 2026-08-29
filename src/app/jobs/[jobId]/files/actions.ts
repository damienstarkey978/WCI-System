"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  deleteFile,
  FileNotFoundError,
  JobNotFoundError,
  setFileVisibility,
  uploadAndRegisterFile,
} from "@/lib/files/service";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

const CATEGORIES = ["DOCUMENT", "PHOTO", "VIDEO", "PRESALE_PHOTO"] as const;

export async function uploadFilesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const categoryRaw = String(formData.get("category") ?? "DOCUMENT");
  const category = (CATEGORIES as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as (typeof CATEGORIES)[number])
    : "DOCUMENT";
  const clientVisible = formData.get("clientVisible") === "on";
  const subVisible = formData.get("subVisible") === "on";

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    return { error: "Choose at least one file." };
  }

  try {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await uploadAndRegisterFile({
        organizationId: user.organizationId,
        jobId,
        uploadedByUserId: user.id,
        fileName: file.name,
        bytes,
        mimeType: file.type || null,
        sizeBytes: file.size,
        category,
        clientVisible,
        subVisible,
      });
    }
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) return { error: error.message };
    if (error instanceof JobNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/files`);
  return { ok: true };
}

export async function deleteFileAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");

  try {
    await deleteFile(user.organizationId, fileId);
  } catch (error) {
    if (error instanceof FileNotFoundError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/files`);
}

export async function updateFileVisibilityAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = formData.get("value") === "true";

  if (field !== "clientVisible" && field !== "subVisible") return;

  try {
    await setFileVisibility(user.organizationId, fileId, { [field]: value });
  } catch (error) {
    if (error instanceof FileNotFoundError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/files`);
}
