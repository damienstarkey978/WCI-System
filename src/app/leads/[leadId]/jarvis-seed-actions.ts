"use server";

import { requireAppUser } from "@/lib/auth";
import {
  LeadJarvisSeedLeadNotFoundError,
  loadLeadGeneralPhotosForJarvis,
  type JarvisSeedPhotoPayload,
} from "@/lib/crm/lead-jarvis-seed";
import { db } from "@/lib/db";
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

/**
 * Newest estimate on this lead that still needs the three-panel workspace
 * (no Proposal yet). Used by Ask Jarvis on Lead Proposals when the chat reply
 * omits the `/leads/estimates/{id}` link — the draft can finish in the DB while
 * the START HERE card stays stuck on an idle/apology bubble.
 */
export async function findLeadPendingEstimateWorkspaceAction(
  leadId: string,
): Promise<{ readonly estimateId: string; readonly title: string } | null> {
  const user = await requireAppUser();
  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId: user.organizationId },
    select: { id: true, convertedJobId: true },
  });
  if (!lead) return null;

  const estimates = await db.estimate.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [{ leadId: lead.id }, ...(lead.convertedJobId ? [{ jobId: lead.convertedJobId }] : [])],
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      title: true,
      proposalOptions: { select: { proposalId: true }, take: 1 },
    },
  });

  const pending = estimates.find((estimate) => !estimate.proposalOptions[0]?.proposalId);
  return pending ? { estimateId: pending.id, title: pending.title } : null;
}
