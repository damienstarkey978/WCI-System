import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    fileFolder: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    jobPermitInspection: { deleteMany: vi.fn() },
    file: { updateMany: vi.fn() },
    job: { findFirst: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { deleteFolder, FolderNotFoundError, normalizeFolderName } from "./folders";

describe("normalizeFolderName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeFolderName("  Site   Plans \n")).toBe("Site Plans");
    expect(normalizeFolderName("   ")).toBe("");
  });
});

describe("deleteFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a document folder without trashing files", async () => {
    vi.mocked(db.fileFolder.findFirst).mockResolvedValue({
      id: "folder_1",
      name: "Plans",
      inspections: [],
    } as never);
    vi.mocked(db.fileFolder.delete).mockResolvedValue({} as never);

    const result = await deleteFolder("org_1", "folder_1");

    expect(result).toEqual({
      id: "folder_1",
      name: "Plans",
      kind: "document",
      trashedFileCount: 0,
      removedInspectionIds: [],
    });
    expect(db.file.updateMany).not.toHaveBeenCalled();
    expect(db.jobPermitInspection.deleteMany).not.toHaveBeenCalled();
    expect(db.fileFolder.delete).toHaveBeenCalledWith({ where: { id: "folder_1" } });
  });

  it("trashes photos and removes the linked inspection for inspection folders", async () => {
    vi.mocked(db.fileFolder.findFirst).mockResolvedValue({
      id: "folder_slab",
      name: "Inspection: Slab",
      inspections: [{ id: "insp_slab" }],
    } as never);
    vi.mocked(db.file.updateMany).mockResolvedValue({ count: 3 } as never);
    vi.mocked(db.jobPermitInspection.deleteMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.fileFolder.delete).mockResolvedValue({} as never);

    const result = await deleteFolder("org_1", "folder_slab");

    expect(result).toEqual({
      id: "folder_slab",
      name: "Inspection: Slab",
      kind: "inspection",
      trashedFileCount: 3,
      removedInspectionIds: ["insp_slab"],
    });
    expect(db.file.updateMany).toHaveBeenCalledWith({
      where: { folderId: "folder_slab", organizationId: "org_1", deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(db.jobPermitInspection.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["insp_slab"] } },
    });
    expect(db.fileFolder.delete).toHaveBeenCalledWith({ where: { id: "folder_slab" } });
  });

  it("throws when the folder is missing", async () => {
    vi.mocked(db.fileFolder.findFirst).mockResolvedValue(null as never);
    await expect(deleteFolder("org_1", "missing")).rejects.toBeInstanceOf(FolderNotFoundError);
  });
});
