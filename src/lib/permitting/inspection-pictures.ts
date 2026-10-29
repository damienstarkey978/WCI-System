/**
 * Inspection Pictures: one FileFolder per JobPermitInspection on the job.
 * Folders are created for inspections on that job's permitting list — never a
 * global dump of every city/demo inspection type.
 *
 * Ops rule (Damien 2026-10-29): never gate folder create / photo upload behind
 * "open permitting." Staff and bots may create an inspection folder by city
 * inspection name; empty permit shells (Building-only default from #67) get
 * typical inspections seeded so folders can materialize.
 * Inspectors get a headless signed share link (no seat/login) to view + upload.
 */

import { PermitTrade } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createFolder, FolderNameTakenError } from "@/lib/files/folders";
import { resolveFileUrlsSafe, uploadAndRegisterFile } from "@/lib/files/service";
import {
  DEFAULT_INSPECTIONS_ON_ADD,
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

export class InspectionFolderNameRequiredError extends Error {
  constructor() {
    super("Inspection name is required.");
    this.name = "InspectionFolderNameRequiredError";
  }
}

/**
 * Recover #67 empty permit shells: permits that exist with zero inspections
 * get that trade's typical city-style defaults so Inspection Pictures can
 * operate. Does not invent permits. Idempotent when inspections already exist.
 */
export async function seedTypicalInspectionsOnEmptyPermits(organizationId: string, jobId: string) {
  const permits = await db.jobPermit.findMany({
    where: { jobId, organizationId },
    select: {
      id: true,
      trade: true,
      _count: { select: { inspections: true } },
    },
  });

  for (const permit of permits) {
    if (permit._count.inspections > 0) continue;
    const defaults = DEFAULT_INSPECTIONS_ON_ADD[permit.trade] ?? [];
    if (defaults.length === 0) continue;
    await db.jobPermitInspection.createMany({
      data: defaults.map((name, index) => ({
        permitId: permit.id,
        name,
        sortOrder: index,
      })),
    });
  }
}

export async function ensureInspectionPictureFolders(organizationId: string, jobId: string) {
  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(jobId);

  // Empty Building/MEP shells (ensureBuildingPermit / ensure-defaults) blocked
  // photo ops after #67 — seed typical inspections so folders can appear.
  await seedTypicalInspectionsOnEmptyPermits(organizationId, jobId);

  // Folders only for inspections already on this job — never invents a catalog dump.
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

export interface CreateInspectionPictureFolderInput {
  readonly organizationId: string;
  readonly jobId: string;
  /** City inspection name (e.g. "Slab", "Electrical Rough") — not Permit Rockstar. */
  readonly name: string;
  /** Defaults from Permit Rockstar guide map, else BUILDING. */
  readonly trade?: PermitTrade;
}

/**
 * Create (or return) one inspection picture folder by city inspection name.
 * Ensures the trade permit exists, adds the inspection if missing, and links
 * a FileFolder — without requiring a trip through the Permitting UI.
 */
export async function createInspectionPictureFolder(input: CreateInspectionPictureFolderInput) {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) throw new InspectionFolderNameRequiredError();

  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, permitNumber: true },
  });
  if (!job) throw new JobNotFoundError(input.jobId);

  const guide = guideForInspectionName(name);
  const trade = input.trade ?? (guide?.trade as PermitTrade | undefined) ?? PermitTrade.BUILDING;

  // Prefer a permit of this trade that already has this inspection name; else
  // the oldest permit of the trade; else create one (multiples per trade OK).
  let permit =
    (
      await db.jobPermitInspection.findFirst({
        where: {
          name: { equals: name, mode: "insensitive" },
          permit: { jobId: job.id, organizationId: input.organizationId, trade },
        },
        select: { permit: true },
      })
    )?.permit ??
    (await db.jobPermit.findFirst({
      where: { jobId: job.id, organizationId: input.organizationId, trade },
      orderBy: { createdAt: "asc" },
    }));
  if (!permit) {
    permit = await db.jobPermit.create({
      data: {
        organizationId: input.organizationId,
        jobId: job.id,
        trade,
        permitNumber: trade === PermitTrade.BUILDING ? job.permitNumber : null,
      },
    });
  }

  let inspection = await db.jobPermitInspection.findFirst({
    where: { permitId: permit.id, name: { equals: name, mode: "insensitive" } },
  });
  if (!inspection) {
    const last = await db.jobPermitInspection.findFirst({
      where: { permitId: permit.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    inspection = await db.jobPermitInspection.create({
      data: {
        permitId: permit.id,
        name,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  if (!inspection.folderId) {
    const folderName = inspectionPictureFolderName(inspection.name);
    let folder = await db.fileFolder.findFirst({
      where: {
        jobId: job.id,
        organizationId: input.organizationId,
        name: { equals: folderName, mode: "insensitive" },
      },
    });
    if (!folder) {
      try {
        folder = await createFolder(input.organizationId, job.id, folderName);
      } catch (error) {
        if (!(error instanceof FolderNameTakenError)) throw error;
        folder = await db.fileFolder.findFirstOrThrow({
          where: {
            jobId: job.id,
            organizationId: input.organizationId,
            name: { equals: folderName, mode: "insensitive" },
          },
        });
      }
    }
    inspection = await db.jobPermitInspection.update({
      where: { id: inspection.id },
      data: { folderId: folder.id },
    });
  }

  await ensureInspectionPictureFolders(input.organizationId, job.id);

  const folders = await listInspectionPictureFolders(input.organizationId, job.id);
  const created = folders.find((row) => row.inspectionId === inspection.id);
  if (!created) {
    throw new Error(`Inspection folder for "${name}" was created but could not be listed.`);
  }
  return created;
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
        select: { id: true, label: true, expiresAt: true, createdAt: true, bearerToken: true },
      },
    },
  });

  return inspections
    .filter((row): row is typeof row & { folder: NonNullable<typeof row.folder> } => row.folder != null)
    .map((row) => {
      const guide = guideForInspectionName(row.name);
      const active = row.shareLinks[0] ?? null;
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
        activeShareLink: active
          ? {
              id: active.id,
              label: active.label,
              expiresAt: active.expiresAt,
              createdAt: active.createdAt,
              sharePath: active.bearerToken
                ? `/inspection-pictures/share/${active.bearerToken}`
                : null,
            }
          : null,
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
        select: { id: true, label: true, expiresAt: true, createdAt: true, bearerToken: true },
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
  const active = inspection.shareLinks[0] ?? null;
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
    activeShareLink: active
      ? {
          id: active.id,
          label: active.label,
          expiresAt: active.expiresAt,
          createdAt: active.createdAt,
          sharePath: active.bearerToken
            ? `/inspection-pictures/share/${active.bearerToken}`
            : null,
        }
      : null,
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
      bearerToken: generated.token,
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

  const signedUrls = await resolveFileUrlsSafe(files.map((file) => file.url));
  const photos = files
    .map((file, index) => ({
      id: file.id,
      fileName: file.fileName,
      url: signedUrls[index] ?? null,
      createdAt: file.createdAt,
    }))
    .filter((file): file is { id: string; fileName: string; url: string; createdAt: Date } => Boolean(file.url));

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
