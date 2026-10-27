"use server";

import { requireAppUser } from "@/lib/auth";
import {
  LeadJarvisSeedLeadNotFoundError,
  loadLeadGeneralPhotosForJarvis,
  type JarvisSeedPhotoPayload,
} from "@/lib/crm/lead-jarvis-seed";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";

export type LoadGeneralPhotosResult =
  | { readonly ok: true; readonly photos: readonly JarvisSeedPhotoPayload[]; readonly truncated: boolean }
  | { readonly ok: false; readonly error: string };

/** Loads General-tab photos as base64 for the Jarvis Attach photos input. */
export async function loadLeadGeneralPhotosForJarvisAction(leadId: string): Promise<LoadGeneralPhotosResult> {
  const user = await requireAppUser();
  try {
    const loaded = await loadLeadGeneralPhotosForJarvis(user.organizationId, leadId);
    if (loaded.photos.length === 0) {
      return { ok: false, error: "No General photos could be loaded. Upload images on the General tab first." };
    }
    return { ok: true, photos: loaded.photos, truncated: loaded.truncated };
  } catch (error) {
    if (error instanceof LeadJarvisSeedLeadNotFoundError) return { ok: false, error: error.message };
    if (error instanceof StorageNotConfiguredError) {
      return { ok: false, error: "File storage is not configured, so General photos cannot be attached yet." };
    }
    throw error;
  }
}
