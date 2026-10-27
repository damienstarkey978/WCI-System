"use server";

import {
  InvalidInspectionShareLinkError,
  uploadViaInspectionShareToken,
} from "@/lib/permitting/inspection-pictures";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";

export interface ShareUploadState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly uploaded?: number;
}

export async function uploadInspectorPhotosAction(
  _previous: ShareUploadState,
  formData: FormData,
): Promise<ShareUploadState> {
  const token = String(formData.get("token") ?? "");
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (!token) return { error: "Missing share link." };
  if (files.length === 0) return { error: "Choose at least one photo." };

  try {
    for (const file of files) {
      await uploadViaInspectionShareToken({
        token,
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type || "image/jpeg",
        sizeBytes: file.size,
      });
    }
  } catch (error) {
    if (error instanceof InvalidInspectionShareLinkError || error instanceof StorageNotConfiguredError) {
      return { error: error.message };
    }
    return { error: error instanceof Error ? error.message : "Upload failed." };
  }

  return { ok: true, uploaded: files.length };
}
