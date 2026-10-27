import { beforeEach, describe, expect, it, vi } from "vitest";

const findLead = vi.fn();
const findAttachments = vi.fn();
const findFiles = vi.fn();
const downloadJobFile = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    lead: { findFirst: (...args: unknown[]) => findLead(...args) },
    leadAttachment: { findMany: (...args: unknown[]) => findAttachments(...args) },
    file: { findMany: (...args: unknown[]) => findFiles(...args) },
  },
}));

vi.mock("@/lib/storage/supabase-storage", () => ({
  StorageNotConfiguredError: class StorageNotConfiguredError extends Error {
    constructor() {
      super("not configured");
      this.name = "StorageNotConfiguredError";
    }
  },
  downloadJobFile: (...args: unknown[]) => downloadJobFile(...args),
}));

import { listLeadGeneralPhotos, loadLeadGeneralPhotosForJarvis } from "@/lib/crm/lead-jarvis-seed";

describe("listLeadGeneralPhotos", () => {
  beforeEach(() => {
    findLead.mockReset();
    findAttachments.mockReset();
    findFiles.mockReset();
    downloadJobFile.mockReset();
  });

  it("returns image lead attachments and skips non-images", async () => {
    findLead.mockResolvedValue({ id: "lead1", convertedJobId: null });
    findAttachments.mockResolvedValue([
      { id: "a1", fileName: "kitchen.jpg", mimeType: "image/jpeg", url: "org/leads/lead1/a1-kitchen.jpg" },
      { id: "a2", fileName: "spec.pdf", mimeType: "application/pdf", url: "org/leads/lead1/a2-spec.pdf" },
    ]);

    const photos = await listLeadGeneralPhotos("org1", "lead1");
    expect(photos).toEqual([
      {
        id: "a1",
        fileName: "kitchen.jpg",
        mimeType: "image/jpeg",
        source: "lead_attachment",
        storageRef: "org/leads/lead1/a1-kitchen.jpg",
      },
    ]);
    expect(findFiles).not.toHaveBeenCalled();
  });

  it("falls back to job PRESALE_PHOTO files after conversion when attachments are gone", async () => {
    findLead.mockResolvedValue({ id: "lead1", convertedJobId: "job1" });
    findAttachments.mockResolvedValue([]);
    findFiles.mockResolvedValue([
      { id: "f1", fileName: "bath.png", mimeType: "image/png", url: "org/job1/presale_photo/f1-bath.png" },
    ]);

    const photos = await listLeadGeneralPhotos("org1", "lead1");
    expect(photos).toEqual([
      {
        id: "f1",
        fileName: "bath.png",
        mimeType: "image/png",
        source: "presale_file",
        storageRef: "org/job1/presale_photo/f1-bath.png",
      },
    ]);
  });
});

describe("loadLeadGeneralPhotosForJarvis", () => {
  beforeEach(() => {
    findLead.mockReset();
    findAttachments.mockReset();
    findFiles.mockReset();
    downloadJobFile.mockReset();
  });

  it("base64-encodes downloaded image bytes", async () => {
    findLead.mockResolvedValue({ id: "lead1", convertedJobId: null });
    findAttachments.mockResolvedValue([
      { id: "a1", fileName: "kitchen.jpg", mimeType: "image/jpeg", url: "path/kitchen.jpg" },
    ]);
    downloadJobFile.mockResolvedValue(Uint8Array.from([1, 2, 3]));

    const loaded = await loadLeadGeneralPhotosForJarvis("org1", "lead1");
    expect(loaded.truncated).toBe(false);
    expect(loaded.photos).toHaveLength(1);
    expect(loaded.photos[0]?.fileName).toBe("kitchen.jpg");
    expect(loaded.photos[0]?.mimeType).toBe("image/jpeg");
    expect(loaded.photos[0]?.base64).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });
});
