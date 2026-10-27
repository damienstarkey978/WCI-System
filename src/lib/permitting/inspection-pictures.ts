/**
 * Inspection Pictures: one FileFolder per JobPermitInspection on the job.
 * Folders are created only for inspections that exist on that job's permitting
 * list — never a global dump of every city/demo inspection type.
 * Inspectors get a headless signed share link (no seat/login) to view + upload.
 */

import { db } from "@/lib/db";
import { createFolder } from "@/lib/files/folders";
import { resolveFileUrlSafe, uploadAndRegisterFile } from "@/lib/files/service";
import {
  ensureDefaultPermits,
  InspectionNotFoundError,
  JobNotFoundError,
} from "@/lib/permitting/service";
import {
  guideForInspectionName,
  inspectionPictureFolderName,
  isSlabInspection,
} from "@/lib/permitting/inspection-guides";
import { generateSecureToken, parseSecureToken, secretMatches } from "@/lib/secure-tokens";
import { emitEvent } from "@/lib/webhooks";

const SHARE_LINK_PREFIX = "wciips";
const SHARE_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export async function ensureInspectionPictureFolders(organizationId: string, jobId: string) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(jobId);

  // Permit shells only — does not invent inspections for the job.
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
      shareLinks: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, label: true, expiresAt: true, createdAt: true },
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
        activeShareLink: row.shareLinks[0] ?? null,
      };
    });
}

export async function getInspectionPictureFolder(organizationId: string, jobId: string, folderId: string) {
  await ensureInspectionPictureFolders(organizationId, jobId);

  const inspection = await db.jobPermitInspection.findFirst({
    where: { folderId, permit: { jobId, organizationId } },
    include: {
      permit: { select: { trade: true } },
      folder: true,
      shareLinks: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, label: true, expiresAt: true, createdAt: true },
      },
    },
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
    activeShareLink: inspection.shareLinks[0] ?? null,
    files,
  };
}

export interface IssueInspectionPictureShareLinkInput {
  readonly organizationId: string;
  readonly inspectionId: string;
  readonly label?: string | null;
  /** When true (default), revoke other active links so staff has one canonical URL. */
  readonly revokePrevious?: boolean;
}

export async function issueInspectionPictureShareLink(input: IssueInspectionPictureShareLinkInput) {
  const inspection = await db.jobPermitInspection.findFirst({
    where: { id: input.inspectionId, permit: { organizationId: input.organizationId } },
    include: { permit: { select: { jobId: true, organizationId: true } } },
  });
  if (!inspection) throw new InspectionNotFoundError(input.inspectionId);

  // Ensure the folder exists before sharing so the inspector always lands somewhere real.
  await ensureInspectionPictureFolders(inspection.permit.organizationId, inspection.permit.jobId);

  if (input.revokePrevious !== false) {
    await db.inspectionPictureShareLink.updateMany({
      where: { inspectionId: inspection.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const generated = generateSecureToken(SHARE_LINK_PREFIX);
  const link = await db.inspectionPictureShareLink.create({
    data: {
      inspectionId: inspection.id,
      label: input.label?.trim() || null,
      tokenId: generated.tokenId,
      hashedSecret: generated.hashedSecret,
      expiresAt: new Date(Date.now() + SHARE_LINK_TTL_MS),
    },
  });

  await emitEvent(input.organizationId, "inspection_pictures.share_link_issued", {
    inspectionId: inspection.id,
    jobId: inspection.permit.jobId,
    shareLinkId: link.id,
  });

  return {
    token: generated.token,
    sharePath: `/inspection-pictures/share/${generated.token}`,
    expiresAt: link.expiresAt,
    linkId: link.id,
  };
}

export class InvalidInspectionShareLinkError extends Error {
  constructor() {
    super("This inspector link is invalid, expired, or has been revoked.");
    this.name = "InvalidInspectionShareLinkError";
  }
}

async function resolveActiveShareLink(token: string) {
  const parsed = parseSecureToken(SHARE_LINK_PREFIX, token);
  if (!parsed) throw new InvalidInspectionShareLinkError();

  const link = await db.inspectionPictureShareLink.findUnique({
    where: { tokenId: parsed.tokenId },
    include: {
      inspection: {
        include: {
          permit: {
            include: {
              job: { select: { id: true, name: true, organizationId: true } },
              organization: { select: { id: true, name: true } },
            },
          },
          folder: true,
        },
      },
    },
  });

  if (
    !link ||
    !secretMatches(parsed.secret, link.hashedSecret) ||
    link.revokedAt !== null ||
    link.expiresAt.getTime() <= Date.now()
  ) {
    throw new InvalidInspectionShareLinkError();
  }

  return link;
}

/** Resolve a share token for the public inspector page (does not consume the link). */
export async function getInspectionFolderForShareToken(token: string) {
  const link = await resolveActiveShareLink(token);

  // Lazily ensure folder if staff issued the link before folders were materialised.
  if (!link.inspection.folderId || !link.inspection.folder) {
    await ensureInspectionPictureFolders(link.inspection.permit.organizationId, link.inspection.permit.jobId);
    const refreshed = await db.jobPermitInspection.findUniqueOrThrow({
      where: { id: link.inspection.id },
      include: { folder: true },
    });
    if (!refreshed.folder) throw new InvalidInspectionShareLinkError();
    link.inspection.folder = refreshed.folder;
    link.inspection.folderId = refreshed.folder.id;
  }

  const folder = link.inspection.folder!;
  const files = await db.file.findMany({
    where: {
      folderId: folder.id,
      jobId: link.inspection.permit.jobId,
      organizationId: link.inspection.permit.organizationId,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, url: true, createdAt: true },
  });

  const photos = (
    await Promise.all(
      files.map(async (file) => ({
        id: file.id,
        fileName: file.fileName,
        url: await resolveFileUrlSafe(file.url),
        createdAt: file.createdAt,
      })),
    )
  ).filter((file): file is { id: string; fileName: string; url: string; createdAt: Date } => Boolean(file.url));

  const guide = guideForInspectionName(link.inspection.name);

  return {
    inspectionId: link.inspection.id,
    inspectionName: link.inspection.name,
    folderId: folder.id,
    jobName: link.inspection.permit.job.name,
    companyName: link.inspection.permit.organization.name,
    organizationId: link.inspection.permit.organizationId,
    jobId: link.inspection.permit.jobId,
    guideUrl: guide?.guideUrl ?? null,
    tips: guide?.tips ?? [],
    requiresTermiteCertNote: isSlabInspection(link.inspection.name),
    photos,
    expiresAt: link.expiresAt,
    label: link.label,
  };
}

export async function uploadViaInspectionShareToken(input: {
  readonly token: string;
  readonly fileName: string;
  readonly bytes: Uint8Array | Buffer;
  readonly mimeType?: string | null;
  readonly sizeBytes?: number | null;
}) {
  const link = await resolveActiveShareLink(input.token);

  if (!link.inspection.folderId) {
    await ensureInspectionPictureFolders(link.inspection.permit.organizationId, link.inspection.permit.jobId);
    const refreshed = await db.jobPermitInspection.findUniqueOrThrow({
      where: { id: link.inspection.id },
      select: { folderId: true },
    });
    if (!refreshed.folderId) throw new InvalidInspectionShareLinkError();
    link.inspection.folderId = refreshed.folderId;
  }

  const file = await uploadAndRegisterFile({
    organizationId: link.inspection.permit.organizationId,
    jobId: link.inspection.permit.jobId,
    uploadedByUserId: null,
    fileName: input.fileName,
    bytes: input.bytes,
    mimeType: input.mimeType ?? "image/jpeg",
    sizeBytes: input.sizeBytes ?? null,
    category: "PHOTO",
    clientVisible: false,
    subVisible: true,
    folderId: link.inspection.folderId,
  });

  await emitEvent(link.inspection.permit.organizationId, "inspection_pictures.uploaded_via_share", {
    inspectionId: link.inspection.id,
    jobId: link.inspection.permit.jobId,
    fileId: file.id,
    shareLinkId: link.id,
  });

  return file;
}

export async function revokeInspectionPictureShareLink(organizationId: string, linkId: string) {
  const link = await db.inspectionPictureShareLink.findFirst({
    where: { id: linkId, inspection: { permit: { organizationId } } },
    select: { id: true },
  });
  if (!link) throw new InspectionNotFoundError(linkId);
  return db.inspectionPictureShareLink.update({
    where: { id: link.id },
    data: { revokedAt: new Date() },
  });
}

export { SHARE_LINK_PREFIX };
