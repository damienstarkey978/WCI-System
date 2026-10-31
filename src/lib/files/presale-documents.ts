/**
 * Buildertrend Documents → "Pre-Sale Documents" (exact BT label).
 *
 * Holds approved/signed proposal PDFs and ProposalReport artifacts. Every job
 * gets the folder (empty is fine). Ensure is idempotent: create-if-missing,
 * then optionally file already-uploaded proposal-like Documents into it.
 */

import { JobStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  createFolder,
  FolderJobNotFoundError,
  FolderNameTakenError,
  normalizeFolderName,
} from "@/lib/files/folders";
import { defaultFolderVisibility } from "@/lib/files/visibility";

/** Exact Buildertrend Documents folder label. */
export const PRESALE_DOCUMENTS_FOLDER_NAME = "Pre-Sale Documents";

const PRESALE_NAME_ALIASES = new Set([
  "pre-sale documents",
  "presale documents",
  "pre sale documents",
]);

/**
 * Detect BT / migration proposal artifacts by file name.
 * Deliberately narrow — do not scoop up random "proposal" mentions in bills.
 */
export function isPresaleDocumentFileName(fileName: string): boolean {
  const n = fileName.trim().toLowerCase();
  if (!n) return false;
  if (n.startsWith("doc-proposal__") || n.startsWith("doc-proposals__")) return true;
  if (n === "proposalreport.xls" || n === "proposalreport.xlsx") return true;
  if (n.includes("approved-proposal") || n.includes("approved_proposal")) return true;
  if (n.includes("signed-proposal") || n.includes("signed_proposal")) return true;
  // Staged exports: `…__proposal….pdf` / `…proposal-s-s-set.pdf`
  if (n.includes("__proposal") || n.includes("-proposal-") || n.endsWith("-proposal.pdf")) {
    return n.endsWith(".pdf") || n.endsWith(".xls") || n.endsWith(".xlsx");
  }
  return false;
}

function matchesPresaleFolderName(name: string): boolean {
  return PRESALE_NAME_ALIASES.has(normalizeFolderName(name).toLowerCase());
}

export type EnsurePresaleDocumentsResult = {
  readonly jobId: string;
  readonly folderId: string;
  readonly folderName: string;
  readonly created: boolean;
  readonly renamed: boolean;
  readonly filesMoved: number;
  readonly alreadyInFolder: number;
};

/**
 * Find or create the Pre-Sale Documents folder on a job. Renames a close alias
 * ("Presale Documents") to the canonical BT label when found.
 */
export async function ensurePresaleDocumentsFolder(
  organizationId: string,
  jobId: string,
): Promise<{ readonly folderId: string; readonly folderName: string; readonly created: boolean; readonly renamed: boolean }> {
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: { id: true },
  });
  if (!job) throw new FolderJobNotFoundError(jobId);

  // Prefer exact name; otherwise any alias on this job.
  const folders = await db.fileFolder.findMany({
    where: { organizationId, jobId },
    select: { id: true, name: true },
  });
  const exact = folders.find((f) => normalizeFolderName(f.name) === PRESALE_DOCUMENTS_FOLDER_NAME);
  if (exact) {
    return { folderId: exact.id, folderName: exact.name, created: false, renamed: false };
  }

  const alias = folders.find((f) => matchesPresaleFolderName(f.name));
  if (alias) {
    const updated = await db.fileFolder.update({
      where: { id: alias.id },
      data: { name: PRESALE_DOCUMENTS_FOLDER_NAME },
    });
    return { folderId: updated.id, folderName: updated.name, created: false, renamed: true };
  }

  try {
    const folder = await createFolder(organizationId, jobId, PRESALE_DOCUMENTS_FOLDER_NAME);
    return { folderId: folder.id, folderName: folder.name, created: true, renamed: false };
  } catch (error) {
    if (error instanceof FolderNameTakenError) {
      // Race: another request created it between find and create.
      const raced = await db.fileFolder.findFirst({
        where: {
          organizationId,
          jobId,
          name: { equals: PRESALE_DOCUMENTS_FOLDER_NAME, mode: "insensitive" },
        },
        select: { id: true, name: true },
      });
      if (raced) {
        return { folderId: raced.id, folderName: raced.name, created: false, renamed: false };
      }
    }
    throw error;
  }
}

/** Move unfiled / wrong-folder proposal artifacts into Pre-Sale Documents. */
export async function filePresaleDocumentsIntoFolder(
  organizationId: string,
  jobId: string,
  folderId: string,
): Promise<{ readonly filesMoved: number; readonly alreadyInFolder: number }> {
  const candidates = await db.file.findMany({
    where: {
      organizationId,
      jobId,
      deletedAt: null,
      category: "DOCUMENT",
    },
    select: { id: true, fileName: true, folderId: true },
  });

  let filesMoved = 0;
  let alreadyInFolder = 0;
  for (const file of candidates) {
    if (!isPresaleDocumentFileName(file.fileName)) continue;
    if (file.folderId === folderId) {
      alreadyInFolder += 1;
      continue;
    }
    await db.file.update({ where: { id: file.id }, data: { folderId } });
    filesMoved += 1;
  }
  return { filesMoved, alreadyInFolder };
}

/** Ensure folder + file matching Documents into it for one job. */
export async function ensurePresaleDocumentsForJob(
  organizationId: string,
  jobId: string,
  options?: { readonly fileIntoFolder?: boolean },
): Promise<EnsurePresaleDocumentsResult> {
  const fileIntoFolder = options?.fileIntoFolder ?? true;
  const ensured = await ensurePresaleDocumentsFolder(organizationId, jobId);
  const filed = fileIntoFolder
    ? await filePresaleDocumentsIntoFolder(organizationId, jobId, ensured.folderId)
    : { filesMoved: 0, alreadyInFolder: 0 };

  return {
    jobId,
    folderId: ensured.folderId,
    folderName: ensured.folderName,
    created: ensured.created,
    renamed: ensured.renamed,
    filesMoved: filed.filesMoved,
    alreadyInFolder: filed.alreadyInFolder,
  };
}

export type EnsurePresaleDocumentsOrgSummary = {
  readonly jobCount: number;
  readonly foldersCreated: number;
  readonly foldersRenamed: number;
  readonly filesMoved: number;
  readonly jobs: readonly EnsurePresaleDocumentsResult[];
};

/**
 * Org-wide ensure. Default: every non-template job (all statuses). Pass
 * `jobStatuses` to narrow (e.g. OPEN-only).
 */
export async function ensurePresaleDocumentsForAllJobs(
  organizationId: string,
  options?: {
    readonly jobStatuses?: readonly JobStatus[];
    readonly fileIntoFolder?: boolean;
  },
): Promise<EnsurePresaleDocumentsOrgSummary> {
  const jobs = await db.job.findMany({
    where: {
      organizationId,
      isTemplate: false,
      ...(options?.jobStatuses ? { status: { in: [...options.jobStatuses] } } : {}),
    },
    select: { id: true },
    orderBy: { name: "asc" },
  });

  const results: EnsurePresaleDocumentsResult[] = [];
  let foldersCreated = 0;
  let foldersRenamed = 0;
  let filesMoved = 0;

  for (const job of jobs) {
    const result = await ensurePresaleDocumentsForJob(organizationId, job.id, {
      fileIntoFolder: options?.fileIntoFolder,
    });
    results.push(result);
    if (result.created) foldersCreated += 1;
    if (result.renamed) foldersRenamed += 1;
    filesMoved += result.filesMoved;
  }

  return {
    jobCount: jobs.length,
    foldersCreated,
    foldersRenamed,
    filesMoved,
    jobs: results,
  };
}

/** Convenience for job-create hooks — folder only, never invents files. */
export async function ensurePresaleDocumentsFolderOnJobCreate(
  organizationId: string,
  jobId: string,
): Promise<void> {
  await ensurePresaleDocumentsFolder(organizationId, jobId);
}

/** Re-export visibility helper so callers can stamp the folder consistently. */
export function presaleDocumentsFolderVisibility() {
  return defaultFolderVisibility(PRESALE_DOCUMENTS_FOLDER_NAME);
}
