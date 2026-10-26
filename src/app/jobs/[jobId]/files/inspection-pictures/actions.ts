"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { JobNotFoundError, purgeFile, trashFile, uploadAndRegisterFile } from "@/lib/files/service";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly uploaded?: number;
}

function revalidate(jobId: string, folderId?: string) {
  revalidatePath(`/jobs/${jobId}/files/inspection-pictures`);
  if (folderId) revalidatePath(`/jobs/${jobId}/files/inspection-pictures/${folderId}`);
  revalidatePath(`/jobs/${jobId}/files`);
}

export async function uploadInspectionPhotosAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const folderId = String(formData.get("folderId") ?? "");
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (!folderId) return { error: "Folder is required." };
  if (files.length === 0) return { error: "Choose at least one photo." };

  try {
    for (const file of files) {
      await uploadAndRegisterFile({
        organizationId: user.organizationId,
        jobId,
        uploadedByUserId: user.id,
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type || "image/jpeg",
        sizeBytes: file.size,
        category: "PHOTO",
        clientVisible: false,
        subVisible: true,
        folderId,
      });
    }
  } catch (error) {
    if (error instanceof StorageNotConfiguredError || error instanceof JobNotFoundError) {
      return { error: error.message };
    }
    return { error: error instanceof Error ? error.message : "Upload failed." };
  }

  revalidate(jobId, folderId);
  return { ok: true, uploaded: files.length };
}

export async function deleteInspectionPhotoAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const folderId = String(formData.get("folderId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");
  try {
    await trashFile(user.organizationId, fileId);
  } catch {
    // already gone
  }
  revalidate(jobId, folderId);
}

export async function purgeInspectionPhotoAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const folderId = String(formData.get("folderId") ?? "");
  try {
    await purgeFile(user.organizationId, String(formData.get("fileId") ?? ""));
  } catch {
    // ignore
  }
  revalidate(jobId, folderId);
}
