/**
 * Loads General-tab notes/photos for the lead Proposals Jarvis seed buttons.
 * Notes are Lead.notes. Photos are image LeadAttachments, or (after conversion)
 * the job's PRESALE_PHOTO Files that those attachments became — same records the
 * General tab already shows, not a parallel store.
 */

import { categoryForMimeType } from "@/lib/crm/attachments";
import { db } from "@/lib/db";
import { MAX_ATTACHMENT_COUNT } from "@/lib/jarvis/attachments";
import { downloadJobFile, StorageNotConfiguredError } from "@/lib/storage/supabase-storage";

export class LeadJarvisSeedLeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead ${leadId} not found`);
    this.name = "LeadJarvisSeedLeadNotFoundError";
  }
}

export interface LeadGeneralPhotoRef {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string | null;
  readonly source: "lead_attachment" | "presale_file";
  /** Storage path or http(s) URL — same shape File.url / LeadAttachment.url use. */
  readonly storageRef: string;
}

export interface JarvisSeedPhotoPayload {
  readonly fileName: string;
  readonly mimeType: string;
  readonly base64: string;
}

/** Image attachments currently on the lead, or Pre-Sale Photos after convert. */
export async function listLeadGeneralPhotos(organizationId: string, leadId: string): Promise<LeadGeneralPhotoRef[]> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId },
    select: { id: true, convertedJobId: true },
  });
  if (!lead) throw new LeadJarvisSeedLeadNotFoundError(leadId);

  const attachments = await db.leadAttachment.findMany({
    where: { organizationId, leadId },
    orderBy: { createdAt: "asc" },
  });
  const fromAttachments: LeadGeneralPhotoRef[] = attachments
    .filter((row) => categoryForMimeType(row.mimeType) === "PRESALE_PHOTO")
    .map((row) => ({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      source: "lead_attachment" as const,
      storageRef: row.url,
    }));

  if (fromAttachments.length > 0 || !lead.convertedJobId) return fromAttachments;

  const files = await db.file.findMany({
    where: { organizationId, jobId: lead.convertedJobId, category: "PRESALE_PHOTO", deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  return files.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    source: "presale_file" as const,
    storageRef: row.url,
  }));
}

async function readStorageBytes(storageRef: string): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(storageRef)) {
    const response = await fetch(storageRef);
    if (!response.ok) throw new Error(`Could not fetch photo (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }
  return downloadJobFile(storageRef);
}

/**
 * Bytes for the Jarvis Attach photos path — capped at MAX_ATTACHMENT_COUNT,
 * base64 so the browser can rebuild File objects without CORS on signed URLs.
 */
export async function loadLeadGeneralPhotosForJarvis(
  organizationId: string,
  leadId: string,
): Promise<{ readonly photos: readonly JarvisSeedPhotoPayload[]; readonly truncated: boolean }> {
  const refs = await listLeadGeneralPhotos(organizationId, leadId);
  const selected = refs.slice(0, MAX_ATTACHMENT_COUNT);
  const photos: JarvisSeedPhotoPayload[] = [];

  for (const ref of selected) {
    try {
      const bytes = await readStorageBytes(ref.storageRef);
      const mimeType = ref.mimeType && ref.mimeType.startsWith("image/") ? ref.mimeType : "image/jpeg";
      photos.push({
        fileName: ref.fileName,
        mimeType,
        base64: Buffer.from(bytes).toString("base64"),
      });
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) throw error;
      // Skip a single broken object rather than failing the whole batch.
      continue;
    }
  }

  return { photos, truncated: refs.length > selected.length };
}
