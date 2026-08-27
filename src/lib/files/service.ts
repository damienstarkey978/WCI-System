/**
 * File metadata registration, plus the Supabase-Storage-backed upload path added
 * in Phase 9a. Two ways a File row's `url` column gets populated:
 *   - `registerFile`: the caller already uploaded to storage of their own choosing
 *     and just hands back a directly-usable URL (http/https) — the original,
 *     storage-agnostic seam (CLAUDE.md 2.1).
 *   - `uploadAndRegisterFile`: the new path — WCI OS itself uploads the bytes to
 *     the private `job-files` Supabase Storage bucket and stores the storage
 *     *path*, not a URL.
 * `resolveFileUrl` is what every reader calls to turn either form into something
 * actually fetchable: an http(s) value passes through untouched, anything else is
 * treated as a storage path and gets a freshly signed URL (never persisted, since
 * the bucket is private and signed URLs expire).
 */

import { db } from "@/lib/db";
import { buildStoragePath, deleteJobFile, signedJobFileUrl, uploadJobFile } from "@/lib/storage/supabase-storage";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class DailyLogNotFoundError extends Error {
  constructor(dailyLogId: string) {
    super(`Daily log ${dailyLogId} not found`);
    this.name = "DailyLogNotFoundError";
  }
}

export class FileNotFoundError extends Error {
  constructor(fileId: string) {
    super(`File ${fileId} not found`);
    this.name = "FileNotFoundError";
  }
}

async function assertJobAndDailyLog(organizationId: string, jobId: string, dailyLogId: string | null | undefined) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId } });
  if (!job) throw new JobNotFoundError(jobId);

  if (dailyLogId) {
    const dailyLog = await db.dailyLog.findFirst({ where: { id: dailyLogId, organizationId, jobId } });
    if (!dailyLog) throw new DailyLogNotFoundError(dailyLogId);
  }
}

export interface RegisterFileInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly uploadedByUserId: string;
  readonly fileName: string;
  readonly url: string;
  readonly mimeType?: string | null;
  readonly sizeBytes?: number | null;
  readonly category?: "DOCUMENT" | "PHOTO" | "VIDEO";
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
  readonly dailyLogId?: string | null;
}

export async function registerFile(input: RegisterFileInput) {
  await assertJobAndDailyLog(input.organizationId, input.jobId, input.dailyLogId);

  return db.file.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      uploadedByUserId: input.uploadedByUserId,
      fileName: input.fileName,
      url: input.url,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      category: input.category ?? "DOCUMENT",
      clientVisible: input.clientVisible ?? true,
      subVisible: input.subVisible ?? true,
      dailyLogId: input.dailyLogId ?? null,
    },
  });
}

export interface UploadAndRegisterFileInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly uploadedByUserId: string;
  readonly fileName: string;
  readonly bytes: Uint8Array | Buffer;
  readonly mimeType?: string | null;
  readonly sizeBytes?: number | null;
  readonly category?: "DOCUMENT" | "PHOTO" | "VIDEO";
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
  readonly dailyLogId?: string | null;
}

/** Uploads the bytes to the job-files bucket, then registers the resulting File row. */
export async function uploadAndRegisterFile(input: UploadAndRegisterFileInput) {
  await assertJobAndDailyLog(input.organizationId, input.jobId, input.dailyLogId);

  const category = input.category ?? "DOCUMENT";
  const id = crypto.randomUUID();
  const path = buildStoragePath({
    organizationId: input.organizationId,
    jobId: input.jobId,
    category,
    fileId: id,
    fileName: input.fileName,
  });

  await uploadJobFile(path, input.bytes, input.mimeType ?? null);

  return db.file.create({
    data: {
      id,
      organizationId: input.organizationId,
      jobId: input.jobId,
      uploadedByUserId: input.uploadedByUserId,
      fileName: input.fileName,
      url: path,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? input.bytes.byteLength,
      category,
      clientVisible: input.clientVisible ?? true,
      subVisible: input.subVisible ?? true,
      dailyLogId: input.dailyLogId ?? null,
    },
  });
}

/** Turns a File.url value into something actually fetchable — see the file-level comment. */
export async function resolveFileUrl(url: string): Promise<string> {
  if (/^https?:\/\//i.test(url)) return url;
  return signedJobFileUrl(url);
}

export async function deleteFile(organizationId: string, fileId: string): Promise<void> {
  const file = await db.file.findFirst({ where: { id: fileId, organizationId } });
  if (!file) throw new FileNotFoundError(fileId);

  if (!/^https?:\/\//i.test(file.url)) {
    await deleteJobFile(file.url);
  }
  await db.file.delete({ where: { id: file.id } });
}

export async function setFileVisibility(
  organizationId: string,
  fileId: string,
  visibility: { clientVisible?: boolean; subVisible?: boolean },
) {
  const file = await db.file.findFirst({ where: { id: fileId, organizationId } });
  if (!file) throw new FileNotFoundError(fileId);

  return db.file.update({ where: { id: file.id }, data: visibility });
}
