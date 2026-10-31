import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    job: { findFirst: vi.fn(), findMany: vi.fn() },
    fileFolder: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    file: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/files/folders", async () => {
  const actual = await vi.importActual<typeof import("./folders")>("@/lib/files/folders");
  return {
    ...actual,
    createFolder: vi.fn(),
  };
});

import { db } from "@/lib/db";
import { createFolder, FolderJobNotFoundError } from "@/lib/files/folders";
import {
  ensurePresaleDocumentsFolder,
  ensurePresaleDocumentsForJob,
  filePresaleDocumentsIntoFolder,
  isPresaleDocumentFileName,
  PRESALE_DOCUMENTS_FOLDER_NAME,
} from "./presale-documents";

describe("isPresaleDocumentFileName", () => {
  it("matches BT migration and staged proposal artifacts", () => {
    expect(isPresaleDocumentFileName("doc-proposal__2129-seminole__approved-proposal.pdf")).toBe(true);
    expect(isPresaleDocumentFileName("2129-seminole__approved-proposal.pdf")).toBe(true);
    expect(isPresaleDocumentFileName("2326-laurel__signed-proposal.pdf")).toBe(true);
    expect(isPresaleDocumentFileName("ProposalReport.xls")).toBe(true);
    expect(isPresaleDocumentFileName("ProposalReport.xlsx")).toBe(true);
    expect(isPresaleDocumentFileName("11613-ft-caroline__sadler-proposal-s-s-set.pdf")).toBe(true);
  });

  it("rejects unrelated documents", () => {
    expect(isPresaleDocumentFileName("doc-bills__seminole_fence.pdf")).toBe(false);
    expect(isPresaleDocumentFileName("12899-cannington__arch-plans.pdf")).toBe(false);
    expect(isPresaleDocumentFileName("presale-photos.zip")).toBe(false);
    expect(isPresaleDocumentFileName("")).toBe(false);
  });
});

describe("ensurePresaleDocumentsFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job_1" } as never);
  });

  it("returns the existing exact folder without creating", async () => {
    vi.mocked(db.fileFolder.findMany).mockResolvedValue([
      { id: "folder_1", name: PRESALE_DOCUMENTS_FOLDER_NAME },
    ] as never);

    const result = await ensurePresaleDocumentsFolder("org_1", "job_1");

    expect(result).toEqual({
      folderId: "folder_1",
      folderName: PRESALE_DOCUMENTS_FOLDER_NAME,
      created: false,
      renamed: false,
    });
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("renames a Presale Documents alias to the BT label", async () => {
    vi.mocked(db.fileFolder.findMany).mockResolvedValue([
      { id: "folder_alias", name: "Presale Documents" },
    ] as never);
    vi.mocked(db.fileFolder.update).mockResolvedValue({
      id: "folder_alias",
      name: PRESALE_DOCUMENTS_FOLDER_NAME,
    } as never);

    const result = await ensurePresaleDocumentsFolder("org_1", "job_1");

    expect(result).toEqual({
      folderId: "folder_alias",
      folderName: PRESALE_DOCUMENTS_FOLDER_NAME,
      created: false,
      renamed: true,
    });
    expect(db.fileFolder.update).toHaveBeenCalledWith({
      where: { id: "folder_alias" },
      data: { name: PRESALE_DOCUMENTS_FOLDER_NAME },
    });
  });

  it("creates the folder when missing", async () => {
    vi.mocked(db.fileFolder.findMany).mockResolvedValue([] as never);
    vi.mocked(createFolder).mockResolvedValue({
      id: "folder_new",
      name: PRESALE_DOCUMENTS_FOLDER_NAME,
    } as never);

    const result = await ensurePresaleDocumentsFolder("org_1", "job_1");

    expect(result.created).toBe(true);
    expect(result.folderId).toBe("folder_new");
    expect(createFolder).toHaveBeenCalledWith("org_1", "job_1", PRESALE_DOCUMENTS_FOLDER_NAME);
  });

  it("throws when the job is missing", async () => {
    vi.mocked(db.job.findFirst).mockResolvedValue(null as never);
    await expect(ensurePresaleDocumentsFolder("org_1", "missing")).rejects.toBeInstanceOf(
      FolderJobNotFoundError,
    );
  });
});

describe("filePresaleDocumentsIntoFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves matching unfiled files and skips others", async () => {
    vi.mocked(db.file.findMany).mockResolvedValue([
      { id: "f1", fileName: "doc-proposal__approved-proposal.pdf", folderId: null },
      { id: "f2", fileName: "doc-bills__receipt.pdf", folderId: null },
      { id: "f3", fileName: "ProposalReport.xls", folderId: "folder_presale" },
      { id: "f4", fileName: "2326-laurel__signed-proposal.pdf", folderId: "other" },
    ] as never);
    vi.mocked(db.file.update).mockResolvedValue({} as never);

    const result = await filePresaleDocumentsIntoFolder("org_1", "job_1", "folder_presale");

    expect(result).toEqual({ filesMoved: 2, alreadyInFolder: 1 });
    expect(db.file.update).toHaveBeenCalledTimes(2);
    expect(db.file.update).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: { folderId: "folder_presale" },
    });
    expect(db.file.update).toHaveBeenCalledWith({
      where: { id: "f4" },
      data: { folderId: "folder_presale" },
    });
  });
});

describe("ensurePresaleDocumentsForJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.job.findFirst).mockResolvedValue({ id: "job_1" } as never);
    vi.mocked(db.fileFolder.findMany).mockResolvedValue([] as never);
    vi.mocked(createFolder).mockResolvedValue({
      id: "folder_new",
      name: PRESALE_DOCUMENTS_FOLDER_NAME,
    } as never);
    vi.mocked(db.file.findMany).mockResolvedValue([
      { id: "f1", fileName: "approved-proposal.pdf", folderId: null },
    ] as never);
    vi.mocked(db.file.update).mockResolvedValue({} as never);
  });

  it("creates the folder and files matching documents", async () => {
    const result = await ensurePresaleDocumentsForJob("org_1", "job_1");
    expect(result).toMatchObject({
      jobId: "job_1",
      folderId: "folder_new",
      created: true,
      filesMoved: 1,
    });
  });

  it("can skip filing when fileIntoFolder is false", async () => {
    const result = await ensurePresaleDocumentsForJob("org_1", "job_1", { fileIntoFolder: false });
    expect(result.filesMoved).toBe(0);
    expect(db.file.findMany).not.toHaveBeenCalled();
  });
});
