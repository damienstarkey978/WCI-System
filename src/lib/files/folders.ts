/**
 * Documents folders for a job (Buildertrend's Files > Documents). Flat, one level.
 * Deleting a folder unfiles its files rather than deleting them (File.folderId is
 * SetNull), so a mis-click never destroys documents.
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
    include: { _count: { select: { files: true } } },
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

export async function deleteFolder(organizationId: string, folderId: string) {
  const folder = await db.fileFolder.findFirst({ where: { id: folderId, organizationId }, select: { id: true } });
  if (!folder) throw new FolderNotFoundError(folderId);
  await db.fileFolder.delete({ where: { id: folder.id } });
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
