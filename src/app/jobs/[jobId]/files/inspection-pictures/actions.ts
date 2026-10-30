"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

import { PermitTrade } from "@/generated/prisma/enums";
import { appBaseUrl } from "@/lib/app-url";
import { requireAppUser } from "@/lib/auth";
import { deleteFolder, FolderNotFoundError } from "@/lib/files/folders";
import { JobNotFoundError, purgeFile, trashFile, uploadAndRegisterFile } from "@/lib/files/service";
import {
  createInspectionPictureFolder,
  InspectionFolderNameRequiredError,
  issueInspectionPictureShareLink,
} from "@/lib/permitting/inspection-pictures";
import { InspectionNotFoundError } from "@/lib/permitting/service";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly uploaded?: number;
  readonly folderId?: string;
}

export interface ShareLinkActionState {
  readonly error?: string;
  readonly shareUrl?: string;
  readonly expiresAt?: string;
}

function revalidate(jobId: string, folderId?: string) {
  revalidatePath(`/jobs/${jobId}/files/inspection-pictures`);
  if (folderId) revalidatePath(`/jobs/${jobId}/files/inspection-pictures/${folderId}`);
  revalidatePath(`/jobs/${jobId}/files`);
  revalidatePath(`/jobs/${jobId}/permitting`);
}

const PERMIT_TRADES = new Set<string>(Object.values(PermitTrade));

export async function createInspectionFolderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const name = String(formData.get("name") ?? "");
  const tradeRaw = String(formData.get("trade") ?? "").trim();
  const trade = tradeRaw && PERMIT_TRADES.has(tradeRaw) ? (tradeRaw as PermitTrade) : undefined;
  if (!jobId) return { error: "Job is required." };

  try {
    const folder = await createInspectionPictureFolder({
      organizationId: user.organizationId,
      jobId,
      name,
      trade,
    });
    revalidate(jobId, folder.folderId);
    return { ok: true, folderId: folder.folderId };
  } catch (error) {
    if (error instanceof InspectionFolderNameRequiredError || error instanceof JobNotFoundError) {
      return { error: error.message };
    }
    return { error: error instanceof Error ? error.message : "Could not create inspection folder." };
  }
}

export async function issueInspectionShareLinkAction(
  _previous: ShareLinkActionState,
  formData: FormData,
): Promise<ShareLinkActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const label = String(formData.get("label") ?? "").trim() || null;
  if (!inspectionId) return { error: "Inspection is required." };

  try {
    const issued = await issueInspectionPictureShareLink({
      organizationId: user.organizationId,
      inspectionId,
      label,
    });
    const base = await appBaseUrl();
    revalidate(jobId);
    return {
      shareUrl: `${base.replace(/\/+$/, "")}${issued.sharePath}`,
      expiresAt: issued.expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof InspectionNotFoundError) return { error: error.message };
    return { error: error instanceof Error ? error.message : "Could not create inspector link." };
  }
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
        subVisible: false,
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

/**
 * Delete an inspection picture folder: trash photos in it, remove the linked
 * JobPermitInspection (so ensure will not recreate it), delete the FileFolder.
 */
export async function deleteInspectionFolderAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const folderId = String(formData.get("folderId") ?? "");
  try {
    await deleteFolder(user.organizationId, folderId);
  } catch (error) {
    if (!(error instanceof FolderNotFoundError)) throw error;
  }
  revalidate(jobId);
  redirect(`/jobs/${jobId}/files/inspection-pictures`);
}
