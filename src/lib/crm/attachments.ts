/**
 * Files attached to a Lead before it has a Job (Buildertrend's lead Attachments).
 * File.jobId is required, so these live in LeadAttachment until the lead converts, at
 * which point moveLeadAttachmentsToJob() turns each into a real job File (same storage
 * object, no re-upload) and removes the lead row.
 */

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { resolveFileUrlSafe } from "@/lib/files/service";
import { deleteJobFile, sanitizeFileName, uploadJobFile } from "@/lib/storage/supabase-storage";

export class LeadAttachmentLeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead ${leadId} not found`);
    this.name = "LeadAttachmentLeadNotFoundError";
  }
}

export function leadAttachmentPath(input: { organizationId: string; leadId: string; attachmentId: string; fileName: string }): string {
  return `${input.organizationId}/leads/${input.leadId}/${input.attachmentId}-${sanitizeFileName(input.fileName)}`;
}

/** Images become the job's Pre-Sale Photos; everything else is a Document. */
export function categoryForMimeType(mimeType: string | null): "PRESALE_PHOTO" | "DOCUMENT" {
  return mimeType?.toLowerCase().startsWith("image/") ? "PRESALE_PHOTO" : "DOCUMENT";
}

export async function uploadLeadAttachment(input: {
  organizationId: string;
  leadId: string;
  uploadedByUserId: string;
  fileName: string;
  bytes: Uint8Array | Buffer;
  mimeType: string | null;
}) {
  const lead = await db.lead.findFirst({ where: { id: input.leadId, organizationId: input.organizationId }, select: { id: true } });
  if (!lead) throw new LeadAttachmentLeadNotFoundError(input.leadId);

  const id = crypto.randomUUID();
  const path = leadAttachmentPath({ organizationId: input.organizationId, leadId: input.leadId, attachmentId: id, fileName: input.fileName });
  await uploadJobFile(path, input.bytes, input.mimeType);

  return db.leadAttachment.create({
    data: {
      id,
      organizationId: input.organizationId,
      leadId: input.leadId,
      fileName: input.fileName,
      url: path,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      uploadedByUserId: input.uploadedByUserId,
    },
  });
}

export async function listLeadAttachments(organizationId: string, leadId: string) {
  const rows = await db.leadAttachment.findMany({ where: { organizationId, leadId }, orderBy: { createdAt: "asc" } });
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      isImage: categoryForMimeType(row.mimeType) === "PRESALE_PHOTO",
      url: await resolveFileUrlSafe(row.url),
    })),
  );
}

export async function deleteLeadAttachment(organizationId: string, attachmentId: string) {
  const row = await db.leadAttachment.findFirst({ where: { id: attachmentId, organizationId } });
  if (!row) return;
  if (!/^https?:\/\//i.test(row.url)) await deleteJobFile(row.url);
  await db.leadAttachment.delete({ where: { id: row.id } });
}

/** Runs inside the conversion transaction so a failed conversion never strands or loses attachments. */
export async function moveLeadAttachmentsToJob(tx: Prisma.TransactionClient, organizationId: string, leadId: string, jobId: string) {
  const rows = await tx.leadAttachment.findMany({ where: { organizationId, leadId }, orderBy: { createdAt: "asc" } });
  for (const row of rows) {
    await tx.file.create({
      data: {
        organizationId,
        jobId,
        uploadedByUserId: row.uploadedByUserId,
        fileName: row.fileName,
        url: row.url,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        category: categoryForMimeType(row.mimeType),
      },
    });
  }
  if (rows.length > 0) await tx.leadAttachment.deleteMany({ where: { organizationId, leadId } });
  return rows.length;
}
