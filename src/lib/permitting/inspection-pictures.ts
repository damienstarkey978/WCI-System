import { db } from "@/lib/db";
import { createFolder } from "@/lib/files/folders";
import {
  ensureDefaultPermits,
  JobNotFoundError,
} from "@/lib/permitting/service";
import {
  guideForInspectionName,
  inspectionPictureFolderName,
  isSlabInspection,
} from "@/lib/permitting/inspection-guides";

export async function ensureInspectionPictureFolders(organizationId: string, jobId: string) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(jobId);

  await ensureDefaultPermits(organizationId, jobId);

  const inspections = await db.jobPermitInspection.findMany({
    where: { permit: { jobId, organizationId } },
    orderBy: [{ permit: { trade: "asc" } }, { sortOrder: "asc" }],
    include: { permit: { select: { trade: true } }, folder: { select: { id: true, name: true } } },
  });

  for (const inspection of inspections) {
    if (inspection.folderId) continue;
    const folderName = inspectionPictureFolderName(inspection.name);
    let folder = await db.fileFolder.findFirst({
      where: { jobId, organizationId, name: { equals: folderName, mode: "insensitive" } },
    });
    if (!folder) {
      folder = await createFolder(organizationId, jobId, folderName);
    }
    await db.jobPermitInspection.update({
      where: { id: inspection.id },
      data: { folderId: folder.id },
    });
  }
}

export async function listInspectionPictureFolders(organizationId: string, jobId: string) {
  await ensureInspectionPictureFolders(organizationId, jobId);

  const inspections = await db.jobPermitInspection.findMany({
    where: { permit: { jobId, organizationId }, folderId: { not: null } },
    orderBy: [{ permit: { trade: "asc" } }, { sortOrder: "asc" }],
    include: {
      permit: { select: { trade: true } },
      folder: {
        include: { _count: { select: { files: { where: { deletedAt: null } } } } },
      },
    },
  });

  return inspections
    .filter((row): row is typeof row & { folder: NonNullable<typeof row.folder> } => row.folder != null)
    .map((row) => {
      const guide = guideForInspectionName(row.name);
      return {
        inspectionId: row.id,
        name: row.name,
        trade: row.permit.trade,
        completedAt: row.completedAt,
        folderId: row.folder.id,
        folderName: row.folder.name,
        photoCount: row.folder._count.files,
        guideUrl: guide?.guideUrl ?? null,
        tips: guide?.tips ?? [],
        requiresTermiteCertNote: isSlabInspection(row.name),
      };
    });
}

export async function getInspectionPictureFolder(organizationId: string, jobId: string, folderId: string) {
  await ensureInspectionPictureFolders(organizationId, jobId);

  const inspection = await db.jobPermitInspection.findFirst({
    where: { folderId, permit: { jobId, organizationId } },
    include: { permit: { select: { trade: true } }, folder: true },
  });
  if (!inspection?.folder) return null;

  const files = await db.file.findMany({
    where: { folderId, jobId, organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { uploadedByUser: { select: { email: true, name: true } } },
  });

  const guide = guideForInspectionName(inspection.name);
  return {
    inspectionId: inspection.id,
    name: inspection.name,
    trade: inspection.permit.trade,
    completedAt: inspection.completedAt,
    folderId: inspection.folder.id,
    folderName: inspection.folder.name,
    guideUrl: guide?.guideUrl ?? null,
    tips: guide?.tips ?? [],
    requiresTermiteCertNote: isSlabInspection(inspection.name),
    files,
  };
}
