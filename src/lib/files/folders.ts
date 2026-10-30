/**
 * Documents folders for a job (Buildertrend's Files > Documents). Flat, one level.
 *
 * Delete behavior:
 * - Document folders: files are unfiled (File.folderId SetNull) — a mis-click never
 *   destroys documents.
 * - Inspection picture folders (linked via JobPermitInspection.folderId): soft-delete
 *   (trash) every non-deleted photo in the folder, remove the JobPermitInspection row
 *   (so ensure will not recreate the folder), then delete the FileFolder. Share links
 *   cascade with the inspection. Photos remain recoverable from Files → View trash.
 */

import { db } from "@/lib/db";

export class FolderNotFoundError extends Error {
  constructor(folderId: string) {
    super(`Folder ${folderId} not found`);
    this.name = "FolderNotFoundError";
  }
}

export class FolderNameTakenError extends Error {
  constructor(name: string) {
    super(`A folder named "${name}" already exists on this job.`);
    this.name = "FolderNameTakenError";
  }
}

export class FolderJobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "FolderJobNotFoundError";
  }
}

export function normalizeFolderName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export async function listFolders(organizationId: string, jobId: string) {
  const folders = await db.fileFolder.findMany({
    where: { organizationId, jobId },
    orderBy: { name: "asc" },
    include: { _count: { select: { files: { where: { deletedAt: null } } } } },
  });
  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    clientVisible: folder.clientVisible,
    subVisible: folder.subVisible,
    fileCount: folder._count.files,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  }));
}

export async function createFolder(organizationId: string, jobId: string, rawName: string) {
  const name = normalizeFolderName(rawName);
  if (!name) throw new Error("Folder name is required.");

  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new FolderJobNotFoundError(jobId);

  const taken = await db.fileFolder.findFirst({ where: { jobId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (taken) throw new FolderNameTakenError(name);

  return db.fileFolder.create({ data: { organizationId, jobId, name } });
}

export type DeleteFolderResult = {
  readonly id: string;
  readonly name: string;
  readonly kind: "document" | "inspection";
  readonly trashedFileCount: number;
  readonly removedInspectionIds: readonly string[];
};

/**
 * Delete a FileFolder. Inspection-linked folders trash their photos and remove the
 * linked JobPermitInspection row(s) so list/ensure will not rematerialize them.
 * Document folders only delete the folder row (files stay on the job, unfiled).
 */
export async function deleteFolder(organizationId: string, folderId: string): Promise<DeleteFolderResult> {
  const folder = await db.fileFolder.findFirst({
    where: { id: folderId, organizationId },
    select: {
      id: true,
      name: true,
      inspections: { select: { id: true } },
    },
  });
  if (!folder) throw new FolderNotFoundError(folderId);

  const inspectionIds = folder.inspections.map((row) => row.id);
  const isInspection = inspectionIds.length > 0;
  let trashedFileCount = 0;

  if (isInspection) {
    const trashed = await db.file.updateMany({
      where: { folderId: folder.id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    trashedFileCount = trashed.count;

    // Remove inspections first so folderId uniqueness / ensure cannot race a recreate.
    await db.jobPermitInspection.deleteMany({
      where: { id: { in: inspectionIds } },
    });
  }

  await db.fileFolder.delete({ where: { id: folder.id } });

  return {
    id: folder.id,
    name: folder.name,
    kind: isInspection ? "inspection" : "document",
    trashedFileCount,
    removedInspectionIds: inspectionIds,
  };
}

export async function setFolderVisibility(organizationId: string, folderId: string, visibility: { clientVisible?: boolean; subVisible?: boolean }) {
  const folder = await db.fileFolder.findFirst({ where: { id: folderId, organizationId }, select: { id: true } });
  if (!folder) throw new FolderNotFoundError(folderId);
  return db.fileFolder.update({ where: { id: folder.id }, data: visibility });
}

/** Move a file into a folder of the SAME job, or pass null to unfile it. */
export async function moveFileToFolder(organizationId: string, fileId: string, folderId: string | null) {
  const file = await db.file.findFirst({ where: { id: fileId, organizationId }, select: { id: true, jobId: true } });
  if (!file) throw new Error(`File ${fileId} not found`);

  if (folderId !== null) {
    const folder = await db.fileFolder.findFirst({ where: { id: folderId, organizationId, jobId: file.jobId }, select: { id: true } });
    if (!folder) throw new FolderNotFoundError(folderId);
  }
  return db.file.update({ where: { id: file.id }, data: { folderId } });
}
