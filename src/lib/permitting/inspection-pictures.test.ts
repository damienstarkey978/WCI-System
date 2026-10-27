import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateSecureToken, hashSecret } from "@/lib/secure-tokens";

vi.mock("@/lib/db", () => ({
  db: {
    job: { findFirst: vi.fn() },
    jobPermit: { findUnique: vi.fn(), create: vi.fn() },
    jobPermitInspection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    fileFolder: { findFirst: vi.fn() },
    file: { findMany: vi.fn(), create: vi.fn() },
    inspectionPictureShareLink: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/files/folders", () => ({
  createFolder: vi.fn(),
}));

vi.mock("@/lib/files/service", () => ({
  resolveFileUrlSafe: vi.fn(async (url: string) => `https://signed.example/${url}`),
  uploadAndRegisterFile: vi.fn(async (input: { fileName: string }) => ({
    id: "file_1",
    fileName: input.fileName,
  })),
}));

vi.mock("@/lib/webhooks", () => ({
  emitEvent: vi.fn(),
}));

vi.mock("@/lib/storage/supabase-storage", () => ({
  uploadJobFile: vi.fn(),
  buildStoragePath: vi.fn(),
  signedJobFileUrl: vi.fn(),
  deleteJobFile: vi.fn(),
  StorageNotConfiguredError: class StorageNotConfiguredError extends Error {},
}));

import { db } from "@/lib/db";
import { createFolder } from "@/lib/files/folders";
import { uploadAndRegisterFile } from "@/lib/files/service";
import {
  getInspectionFolderForShareToken,
  InvalidInspectionShareLinkError,
  issueInspectionPictureShareLink,
  listInspectionPictureFolders,
  uploadViaInspectionShareToken,
} from "@/lib/permitting/inspection-pictures";
import { emitEvent } from "@/lib/webhooks";

describe("inspection pictures folders + share links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists folders only for inspections that exist on the job", async () => {
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job_1" } as never);
    vi.mocked(db.jobPermit.findUnique).mockResolvedValue({ id: "permit_1" } as never);
    vi.mocked(db.jobPermitInspection.findMany)
      .mockResolvedValueOnce([
        {
          id: "insp_slab",
          name: "Slab",
          folderId: null,
          completedAt: null,
          permit: { trade: "BUILDING" },
          folder: null,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "insp_slab",
          name: "Slab",
          folderId: "folder_1",
          completedAt: null,
          permit: { trade: "BUILDING" },
          folder: { id: "folder_1", name: "Inspection: Slab", _count: { files: 2 } },
          shareLinks: [],
        },
      ] as never);
    vi.mocked(db.fileFolder.findFirst).mockResolvedValue(null as never);
    vi.mocked(createFolder).mockResolvedValue({ id: "folder_1", name: "Inspection: Slab" } as never);
    vi.mocked(db.jobPermitInspection.update).mockResolvedValue({} as never);

    const folders = await listInspectionPictureFolders("org_1", "job_1");

    expect(folders).toHaveLength(1);
    expect(folders[0]?.name).toBe("Slab");
    expect(folders[0]?.folderId).toBe("folder_1");
    expect(folders[0]?.photoCount).toBe(2);
    // Must not invent a global catalog dump — only the job's inspection rows.
    expect(vi.mocked(db.jobPermitInspection.findMany).mock.calls[0]?.[0]).toMatchObject({
      where: { permit: { jobId: "job_1", organizationId: "org_1" } },
    });
  });

  it("issues a reusable inspector share link and returns the public path", async () => {
    vi.mocked(db.jobPermitInspection.findFirst).mockResolvedValue({
      id: "insp_1",
      folderId: "folder_1",
      permit: { jobId: "job_1", organizationId: "org_1" },
    } as never);
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job_1" } as never);
    vi.mocked(db.jobPermit.findUnique).mockResolvedValue({ id: "permit_1" } as never);
    vi.mocked(db.jobPermitInspection.findMany).mockResolvedValue([] as never);
    vi.mocked(db.inspectionPictureShareLink.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.inspectionPictureShareLink.create).mockResolvedValue({
      id: "link_1",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    } as never);

    const issued = await issueInspectionPictureShareLink({
      organizationId: "org_1",
      inspectionId: "insp_1",
      label: "City inspector",
    });

    expect(issued.sharePath).toMatch(/^\/inspection-pictures\/share\/wciips_/);
    expect(issued.token.startsWith("wciips_")).toBe(true);
    expect(emitEvent).toHaveBeenCalledWith(
      "org_1",
      "inspection_pictures.share_link_issued",
      expect.objectContaining({ inspectionId: "insp_1", jobId: "job_1" }),
    );
  });

  it("resolves a valid share token for view + upload", async () => {
    const generated = generateSecureToken("wciips");
    vi.mocked(db.inspectionPictureShareLink.findUnique).mockResolvedValue({
      id: "link_1",
      hashedSecret: generated.hashedSecret,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      label: null,
      inspection: {
        id: "insp_1",
        name: "Framing",
        folderId: "folder_1",
        folder: { id: "folder_1", name: "Inspection: Framing" },
        permit: {
          jobId: "job_1",
          organizationId: "org_1",
          job: { id: "job_1", name: "Oak St", organizationId: "org_1" },
          organization: { id: "org_1", name: "World Construction Inc" },
        },
      },
    } as never);
    vi.mocked(db.file.findMany).mockResolvedValue([
      { id: "file_1", fileName: "a.jpg", url: "org/job/a.jpg", createdAt: new Date() },
    ] as never);

    const resolved = await getInspectionFolderForShareToken(generated.token);
    expect(resolved.inspectionName).toBe("Framing");
    expect(resolved.photos).toHaveLength(1);
    expect(resolved.photos[0]?.url).toContain("https://signed.example/");
  });

  it("rejects revoked or bad share tokens", async () => {
    const generated = generateSecureToken("wciips");
    vi.mocked(db.inspectionPictureShareLink.findUnique).mockResolvedValue({
      id: "link_1",
      hashedSecret: hashSecret("wrong"),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      inspection: {
        id: "insp_1",
        name: "Framing",
        folderId: "folder_1",
        folder: { id: "folder_1" },
        permit: {
          jobId: "job_1",
          organizationId: "org_1",
          job: { id: "job_1", name: "Oak", organizationId: "org_1" },
          organization: { id: "org_1", name: "WCI" },
        },
      },
    } as never);

    await expect(getInspectionFolderForShareToken(generated.token)).rejects.toBeInstanceOf(
      InvalidInspectionShareLinkError,
    );
  });

  it("uploads via share token without a staff user", async () => {
    const generated = generateSecureToken("wciips");
    vi.mocked(db.inspectionPictureShareLink.findUnique).mockResolvedValue({
      id: "link_1",
      hashedSecret: generated.hashedSecret,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      inspection: {
        id: "insp_1",
        name: "Slab",
        folderId: "folder_1",
        folder: { id: "folder_1" },
        permit: {
          jobId: "job_1",
          organizationId: "org_1",
          job: { id: "job_1", name: "Oak", organizationId: "org_1" },
          organization: { id: "org_1", name: "WCI" },
        },
      },
    } as never);

    await uploadViaInspectionShareToken({
      token: generated.token,
      fileName: "slab.jpg",
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
    });

    expect(uploadAndRegisterFile).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadedByUserId: null,
        folderId: "folder_1",
        category: "PHOTO",
        fileName: "slab.jpg",
      }),
    );
  });
});
