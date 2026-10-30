/**
 * One-shot heal: flip wrongly-public folders and cost documents to internal.
 *
 * Targets (org-wide, OPEN jobs by default — pass allStatuses when needed):
 *   - FileFolders named Inspection:* or *Termite* → clientVisible/subVisible false
 *   - DOCUMENT files whose names look like bills/receipts/POs/proofs → same
 *   - Files sitting in an internal folder that are still client/sub true → same
 */

import { db } from "@/lib/db";
import {
  isInternalCostDocumentFileName,
  isInternalFolderName,
} from "@/lib/files/visibility";
import type { JobStatus } from "@/generated/prisma/enums";

const DEFAULT_STATUSES: readonly JobStatus[] = ["OPEN", "WARRANTY"];

export interface HealVisibilityResult {
  readonly folderCount: number;
  readonly foldersUpdated: number;
  readonly documentFilesUpdated: number;
  readonly filesInInternalFoldersUpdated: number;
}

export async function healFileVisibility(
  organizationId: string,
  options?: { readonly jobStatuses?: readonly JobStatus[]; readonly jobId?: string },
): Promise<HealVisibilityResult> {
  const statuses = options?.jobStatuses ?? DEFAULT_STATUSES;
  const jobFilter = {
    organizationId,
    ...(options?.jobId ? { id: options.jobId } : { status: { in: [...statuses] } }),
  };

  const jobs = await db.job.findMany({ where: jobFilter, select: { id: true } });
  const jobIds = jobs.map((job) => job.id);
  if (jobIds.length === 0) {
    return {
      folderCount: 0,
      foldersUpdated: 0,
      documentFilesUpdated: 0,
      filesInInternalFoldersUpdated: 0,
    };
  }

  const folders = await db.fileFolder.findMany({
    where: { organizationId, jobId: { in: jobIds } },
    select: { id: true, name: true, clientVisible: true, subVisible: true },
  });

  const internalFolderIds: string[] = [];
  let foldersUpdated = 0;
  for (const folder of folders) {
    if (!isInternalFolderName(folder.name)) continue;
    internalFolderIds.push(folder.id);
    if (folder.clientVisible || folder.subVisible) {
      await db.fileFolder.update({
        where: { id: folder.id },
        data: { clientVisible: false, subVisible: false },
      });
      foldersUpdated += 1;
    }
  }

  const documents = await db.file.findMany({
    where: {
      organizationId,
      jobId: { in: jobIds },
      deletedAt: null,
      category: "DOCUMENT",
      OR: [{ clientVisible: true }, { subVisible: true }],
    },
    select: { id: true, fileName: true },
  });

  let documentFilesUpdated = 0;
  const costDocIds = documents
    .filter((file) => isInternalCostDocumentFileName(file.fileName))
    .map((file) => file.id);
  if (costDocIds.length > 0) {
    const updated = await db.file.updateMany({
      where: { id: { in: costDocIds } },
      data: { clientVisible: false, subVisible: false },
    });
    documentFilesUpdated = updated.count;
  }

  let filesInInternalFoldersUpdated = 0;
  if (internalFolderIds.length > 0) {
    const updated = await db.file.updateMany({
      where: {
        organizationId,
        folderId: { in: internalFolderIds },
        deletedAt: null,
        OR: [{ clientVisible: true }, { subVisible: true }],
      },
      data: { clientVisible: false, subVisible: false },
    });
    filesInInternalFoldersUpdated = updated.count;
  }

  return {
    folderCount: folders.length,
    foldersUpdated,
    documentFilesUpdated,
    filesInInternalFoldersUpdated,
  };
}
