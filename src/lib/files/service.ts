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

import type { Actor } from "@/lib/actor";
import { uploaderColumns } from "@/lib/actor";
import { db } from "@/lib/db";
import { assertFolderOnJob, FolderNotFoundError, FolderWrongJobError } from "@/lib/files/folders";
import { DEFAULT_FILE_VISIBILITY } from "@/lib/files/visibility";
// uploaderColumns still used inside safeUploaderColumns
import {
  buildStoragePath,
  deleteJobFile,
  signedJobFileUrl,
  signedJobFileUrls,
  uploadJobFile,
} from "@/lib/storage/supabase-storage";

export { FolderNotFoundError, FolderWrongJobError };

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

export type FileCategoryInput = "DOCUMENT" | "PHOTO" | "VIDEO" | "PRESALE_PHOTO" | "PLAN";

export interface RegisterFileInput {
  readonly organizationId: string;
  readonly jobId: string;
  /** Null for headless inspector uploads (InspectionPictureShareLink). Prefer `actor` for staff/API. */
  readonly uploadedByUserId?: string | null;
  readonly actor?: Actor;
  readonly fileName: string;
  readonly url: string;
  readonly mimeType?: string | null;
  readonly sizeBytes?: number | null;
  readonly category?: FileCategoryInput;
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
  readonly dailyLogId?: string | null;
  readonly folderId?: string | null;
  readonly purchaseOrderId?: string | null;
  readonly billId?: string | null;
}

export async function registerFile(input: RegisterFileInput) {
  await assertJobAndDailyLog(input.organizationId, input.jobId, input.dailyLogId);
  await assertPurchaseOrder(input.organizationId, input.jobId, input.purchaseOrderId);
  await assertBill(input.organizationId, input.jobId, input.billId);

  const uploaders = await safeUploaderColumns(input.actor, input.uploadedByUserId);

  return db.file.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      uploadedByUserId: uploaders.uploadedByUserId,
      uploadedByApiKeyId: uploaders.uploadedByApiKeyId,
      fileName: input.fileName,
      url: input.url,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      category: input.category ?? "DOCUMENT",
      clientVisible: input.clientVisible ?? DEFAULT_FILE_VISIBILITY.clientVisible,
      subVisible: input.subVisible ?? DEFAULT_FILE_VISIBILITY.subVisible,
      dailyLogId: input.dailyLogId ?? null,
      folderId: await validFolderId(input.organizationId, input.jobId, input.folderId),
      purchaseOrderId: input.purchaseOrderId ?? null,
      billId: input.billId ?? null,
    },
  });
}

export interface UploadAndRegisterFileInput {
  readonly organizationId: string;
  readonly jobId: string;
  /** Null for headless inspector uploads (InspectionPictureShareLink). Prefer `actor`. */
  readonly uploadedByUserId?: string | null;
  readonly actor?: Actor;
  readonly fileName: string;
  readonly bytes: Uint8Array | Buffer;
  readonly mimeType?: string | null;
  readonly sizeBytes?: number | null;
  readonly category?: FileCategoryInput;
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
  readonly dailyLogId?: string | null;
  /** Must be a folder on the same job; ignored (unfiled) if it is not. */
  readonly folderId?: string | null;
  readonly purchaseOrderId?: string | null;
  readonly billId?: string | null;
}

/** Uploads the bytes to the job-files bucket, then registers the resulting File row. */
export async function uploadAndRegisterFile(input: UploadAndRegisterFileInput) {
  await assertJobAndDailyLog(input.organizationId, input.jobId, input.dailyLogId);
  await assertPurchaseOrder(input.organizationId, input.jobId, input.purchaseOrderId);
  await assertBill(input.organizationId, input.jobId, input.billId);

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

  const uploaders = await safeUploaderColumns(input.actor, input.uploadedByUserId);

  return db.file.create({
    data: {
      id,
      organizationId: input.organizationId,
      jobId: input.jobId,
      uploadedByUserId: uploaders.uploadedByUserId,
      uploadedByApiKeyId: uploaders.uploadedByApiKeyId,
      fileName: input.fileName,
      url: path,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? input.bytes.byteLength,
      category,
      clientVisible: input.clientVisible ?? DEFAULT_FILE_VISIBILITY.clientVisible,
      subVisible: input.subVisible ?? DEFAULT_FILE_VISIBILITY.subVisible,
      dailyLogId: input.dailyLogId ?? null,
      folderId: await validFolderId(input.organizationId, input.jobId, input.folderId),
      purchaseOrderId: input.purchaseOrderId ?? null,
      billId: input.billId ?? null,
    },
  });
}

export class PurchaseOrderNotFoundForFileError extends Error {
  constructor(purchaseOrderId: string) {
    super(`No purchase order ${purchaseOrderId} on this job.`);
    this.name = "PurchaseOrderNotFoundForFileError";
  }
}

export class BillNotFoundForFileError extends Error {
  constructor(billId: string) {
    super(`No bill ${billId} on this job.`);
    this.name = "BillNotFoundForFileError";
  }
}

async function assertPurchaseOrder(
  organizationId: string,
  jobId: string,
  purchaseOrderId: string | null | undefined,
) {
  if (!purchaseOrderId) return;
  const po = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId, jobId },
    select: { id: true },
  });
  if (!po) throw new PurchaseOrderNotFoundForFileError(purchaseOrderId);
}

async function assertBill(organizationId: string, jobId: string, billId: string | null | undefined) {
  if (!billId) return;
  const bill = await db.bill.findFirst({
    where: { id: billId, organizationId, jobId },
    select: { id: true },
  });
  if (!bill) throw new BillNotFoundForFileError(billId);
}

async function validFolderId(organizationId: string, jobId: string, folderId: string | null | undefined): Promise<string | null> {
  if (!folderId) return null;
  return assertFolderOnJob(organizationId, jobId, folderId);
}

/**
 * Resolve uploadedByApiKeyId safely. OAuth machine tokens put an access-token id
 * into ApiKeyContext.apiKeyId — that id is not an ApiKey row, so writing it to
 * File.uploadedByApiKeyId 500s on the FK. Only stamp a real ApiKey id.
 */
export async function safeUploaderColumns(actor: Actor | undefined, uploadedByUserId?: string | null) {
  if (!actor) {
    return { uploadedByUserId: uploadedByUserId ?? null, uploadedByApiKeyId: null as string | null };
  }
  const cols = uploaderColumns(actor);
  if (!cols.uploadedByApiKeyId) return cols;
  const key = await db.apiKey.findFirst({
    where: { id: cols.uploadedByApiKeyId },
    select: { id: true },
  });
  if (!key) {
    return { uploadedByUserId: cols.uploadedByUserId, uploadedByApiKeyId: null };
  }
  return cols;
}

export interface UpdateFileInput {
  readonly folderId?: string | null;
  readonly fileName?: string;
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
}

/** Move / rename / change visibility on a non-trashed File. */
export async function updateFile(organizationId: string, fileId: string, input: UpdateFileInput) {
  const file = await db.file.findFirst({
    where: { id: fileId, organizationId, deletedAt: null },
    select: { id: true, jobId: true },
  });
  if (!file) throw new FileNotFoundError(fileId);

  const data: {
    folderId?: string | null;
    fileName?: string;
    clientVisible?: boolean;
    subVisible?: boolean;
  } = {};

  if (input.folderId !== undefined) {
    data.folderId = input.folderId === null ? null : await assertFolderOnJob(organizationId, file.jobId, input.folderId);
  }
  if (input.fileName !== undefined) {
    const name = input.fileName.trim();
    if (!name) throw new Error("fileName is required.");
    data.fileName = name.slice(0, 255);
  }
  if (input.clientVisible !== undefined) data.clientVisible = input.clientVisible;
  if (input.subVisible !== undefined) data.subVisible = input.subVisible;

  if (Object.keys(data).length === 0) {
    return db.file.findFirstOrThrow({ where: { id: file.id } });
  }

  return db.file.update({ where: { id: file.id }, data });
}

/** Turns a File.url value into something actually fetchable — see the file-level comment. */
export async function resolveFileUrl(url: string): Promise<string> {
  if (/^https?:\/\//i.test(url)) return url;
  return signedJobFileUrl(url);
}

/**
 * The same thing, but returning null instead of throwing when a file can't be
 * signed — a row pointing at an object that isn't in the bucket, storage not
 * configured, a transient Supabase error.
 *
 * **Use this, not resolveFileUrl, whenever resolving a list of files.** Signing a
 * whole list inside Promise.all means one unsignable row rejects the lot: the page
 * 500s, and every *good* file on that job becomes invisible too. That is a real
 * failure this app has had — the Files page went down site-wide on every job,
 * surfacing only as React error #441 ("an error occurred in the Server Components
 * render"), which says nothing about storage at all. Duplicate rows left behind by
 * failed uploads are exactly the kind that can't be signed.
 *
 * resolveFileUrl stays strict for single-file operations, where the caller is acting
 * on one specific file and silence would be worse than an error.
 */
export async function resolveFileUrlSafe(url: string): Promise<string | null> {
  try {
    return await resolveFileUrl(url);
  } catch {
    return null;
  }
}

/**
 * Resolve many File.url values with one storage round-trip for the non-http
 * paths. Prefer this over `Promise.all(urls.map(resolveFileUrlSafe))` on any
 * list page — that pattern is an N+1 against Supabase Storage.
 */
export async function resolveFileUrlsSafe(urls: readonly string[]): Promise<(string | null)[]> {
  const storageIndexes: number[] = [];
  const storagePaths: string[] = [];
  const results: (string | null)[] = urls.map((url, index) => {
    if (/^https?:\/\//i.test(url)) return url;
    storageIndexes.push(index);
    storagePaths.push(url);
    return null;
  });

  if (storagePaths.length === 0) return results;

  try {
    const signed = await signedJobFileUrls(storagePaths);
    for (let i = 0; i < storageIndexes.length; i++) {
      const index = storageIndexes[i]!;
      const path = storagePaths[i]!;
      results[index] = signed.get(path) ?? null;
    }
  } catch {
    // Same soft-fail contract as resolveFileUrlSafe: leave storage paths null.
  }
  return results;
}

/** Moves a file to the job's trash. Nothing is removed from storage until purgeFile(). */
export async function trashFile(organizationId: string, fileId: string): Promise<void> {
  const file = await db.file.findFirst({ where: { id: fileId, organizationId, deletedAt: null }, select: { id: true } });
  if (!file) throw new FileNotFoundError(fileId);
  await db.file.update({ where: { id: file.id }, data: { deletedAt: new Date() } });
}

export async function restoreFile(organizationId: string, fileId: string): Promise<void> {
  const file = await db.file.findFirst({ where: { id: fileId, organizationId, deletedAt: { not: null } }, select: { id: true } });
  if (!file) throw new FileNotFoundError(fileId);
  await db.file.update({ where: { id: file.id }, data: { deletedAt: null } });
}

/** "Delete forever": only for a file already in the trash. */
export async function purgeFile(organizationId: string, fileId: string): Promise<void> {
  const file = await db.file.findFirst({ where: { id: fileId, organizationId, deletedAt: { not: null } } });
  if (!file) throw new FileNotFoundError(fileId);
  await deleteFile(organizationId, file.id);
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

/**
 * Plans & Specs source of truth for job plan drawings: File rows with
 * category PLAN (not trashed). Takeoffs import-from-Plans-Specs and the
 * Plans tab both read this — do not invent a parallel plans store.
 */
export async function listJobPlanFiles(organizationId: string, jobId: string) {
  return db.file.findMany({
    where: { organizationId, jobId, category: "PLAN", deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { uploadedByUser: true },
  });
}
