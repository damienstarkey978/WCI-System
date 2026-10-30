import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateSecureToken, hashSecret } from "@/lib/secure-tokens";

vi.mock("@/lib/db", () => ({
  db: {
    job: { findFirst: vi.fn() },
    jobPermit: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    jobPermitInspection: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    fileFolder: { findFirst: vi.fn(), findFirstOrThrow: vi.fn() },
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
  resolveFileUrlsSafe: vi.fn(async (urls: readonly string[]) => urls.map((url) => `https://signed.example/${url}`)),
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
  createInspectionPictureFolder,
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
    vi.mocked(db.jobPermit.findMany).mockResolvedValue([] as never);
    vi.mocked(db.jobPermit.findFirst).mockReset();
    vi.mocked(db.jobPermitInspection.findFirst).mockReset();
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

  it("disambiguates folder names when two trades share an inspection name", async () => {
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job_1" } as never);
    vi.mocked(db.jobPermit.findMany).mockResolvedValue([] as never);
    // ensure pass: BUILDING Final already linked; ELECTRICAL Final needs a folder
    vi.mocked(db.jobPermitInspection.findMany)
      .mockResolvedValueOnce([
        {
          id: "insp_bldg_final",
          name: "Final",
          folderId: "folder_bldg",
          completedAt: null,
          permit: { trade: "BUILDING" },
          folder: { id: "folder_bldg", name: "Inspection: Final" },
        },
        {
          id: "insp_elec_final",
          name: "Final",
          folderId: null,
          completedAt: null,
          permit: { trade: "ELECTRICAL" },
          folder: null,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "insp_bldg_final",
          name: "Final",
          folderId: "folder_bldg",
          completedAt: null,
          permit: { trade: "BUILDING" },
          folder: { id: "folder_bldg", name: "Inspection: Final", _count: { files: 0 } },
          shareLinks: [],
        },
        {
          id: "insp_elec_final",
          name: "Final",
          folderId: "folder_elec",
          completedAt: null,
          permit: { trade: "ELECTRICAL" },
          folder: { id: "folder_elec", name: "Inspection: ELECTRICAL — Final", _count: { files: 0 } },
          shareLinks: [],
        },
      ] as never);

    // Preferred name "Inspection: Final" already exists…
    vi.mocked(db.fileFolder.findFirst)
      .mockResolvedValueOnce({ id: "folder_bldg" } as never)
      // …trade-disambiguated name is free
      .mockResolvedValueOnce(null as never);
    // Claimed by the other inspection → skip preferred name
    vi.mocked(db.jobPermitInspection.findFirst).mockResolvedValueOnce({ id: "insp_bldg_final" } as never);
    vi.mocked(createFolder).mockResolvedValue({
      id: "folder_elec",
      name: "Inspection: ELECTRICAL — Final",
    } as never);
    vi.mocked(db.jobPermitInspection.update).mockResolvedValue({} as never);

    const folders = await listInspectionPictureFolders("org_1", "job_1");

    expect(createFolder).toHaveBeenCalledWith("org_1", "job_1", "Inspection: ELECTRICAL — Final");
    expect(folders).toHaveLength(2);
    expect(folders.map((f) => f.folderName).sort()).toEqual([
      "Inspection: ELECTRICAL — Final",
      "Inspection: Final",
    ]);
  });

  it("does not invent typical inspections on empty permit shells when listing folders", async () => {
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job_1" } as never);
    vi.mocked(db.jobPermitInspection.findMany).mockResolvedValue([] as never);

    const folders = await listInspectionPictureFolders("org_1", "job_1");

    expect(folders).toEqual([]);
    expect(db.jobPermitInspection.createMany).not.toHaveBeenCalled();
    // Only inspections already on the job are considered — no empty-shell seed.
    expect(vi.mocked(db.jobPermitInspection.findMany).mock.calls[0]?.[0]).toMatchObject({
      where: { permit: { jobId: "job_1", organizationId: "org_1" } },
    });
  });

  it("creates an inspection folder by city name without a Permitting detour", async () => {
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job_1", permitNumber: "BP-1" } as never);
    vi.mocked(db.jobPermit.findFirst).mockResolvedValue(null as never);
    vi.mocked(db.jobPermit.create).mockResolvedValue({ id: "permit_1", trade: "BUILDING" } as never);
    // 1) no inspection→permit match; 2) no existing inspection by name; 3) last sortOrder
    vi.mocked(db.jobPermitInspection.findFirst)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ sortOrder: -1 } as never);
    vi.mocked(db.jobPermitInspection.create).mockResolvedValue({
      id: "insp_slab",
      name: "Slab",
      folderId: null,
    } as never);
    vi.mocked(db.fileFolder.findFirst).mockResolvedValue(null as never);
    vi.mocked(createFolder).mockResolvedValue({ id: "folder_1", name: "Inspection: Slab" } as never);
    vi.mocked(db.jobPermitInspection.update).mockResolvedValue({
      id: "insp_slab",
      name: "Slab",
      folderId: "folder_1",
    } as never);
    vi.mocked(db.jobPermit.findMany).mockResolvedValue([] as never);
    const listed = {
      id: "insp_slab",
      name: "Slab",
      folderId: "folder_1",
      completedAt: null,
      permit: { trade: "BUILDING" },
      folder: { id: "folder_1", name: "Inspection: Slab", _count: { files: 0 } },
      shareLinks: [],
    };
    vi.mocked(db.jobPermitInspection.findMany).mockResolvedValue([listed] as never);

    const folder = await createInspectionPictureFolder({
      organizationId: "org_1",
      jobId: "job_1",
      name: "Slab",
    });

    expect(folder.folderId).toBe("folder_1");
    expect(folder.name).toBe("Slab");
    expect(db.jobPermit.create).toHaveBeenCalled();
    expect(createFolder).toHaveBeenCalledWith("org_1", "job_1", "Inspection: Slab");
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
    expect(vi.mocked(db.inspectionPictureShareLink.create).mock.calls[0]?.[0]).toMatchObject({
      data: expect.objectContaining({
        bearerToken: issued.token,
        label: "City inspector",
      }),
    });
    expect(emitEvent).toHaveBeenCalledWith(
      "org_1",
      "inspection_pictures.share_link_issued",
      expect.objectContaining({ inspectionId: "insp_1", jobId: "job_1" }),
    );
  });

  it("exposes a re-copyable sharePath on the active link when bearerToken is stored", async () => {
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job_1" } as never);
    vi.mocked(db.jobPermit.findUnique).mockResolvedValue({ id: "permit_1" } as never);
    vi.mocked(db.jobPermitInspection.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        {
          id: "insp_slab",
          name: "Slab",
          folderId: "folder_1",
          completedAt: null,
          permit: { trade: "BUILDING" },
          folder: { id: "folder_1", name: "Inspection: Slab", _count: { files: 0 } },
          shareLinks: [
            {
              id: "link_1",
              label: "Permit Rockstar",
              expiresAt: new Date("2030-01-01T00:00:00.000Z"),
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              bearerToken: "wciips_abc_secret",
            },
          ],
        },
      ] as never);

    const folders = await listInspectionPictureFolders("org_1", "job_1");
    expect(folders[0]?.activeShareLink?.sharePath).toBe(
      "/inspection-pictures/share/wciips_abc_secret",
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
