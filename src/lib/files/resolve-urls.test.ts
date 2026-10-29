import { beforeEach, describe, expect, it, vi } from "vitest";

const signedJobFileUrls = vi.fn();
const signedJobFileUrl = vi.fn();

vi.mock("@/lib/storage/supabase-storage", () => ({
  signedJobFileUrls: (...args: unknown[]) => signedJobFileUrls(...args),
  signedJobFileUrl: (...args: unknown[]) => signedJobFileUrl(...args),
  buildStoragePath: vi.fn(),
  uploadJobFile: vi.fn(),
  deleteJobFile: vi.fn(),
  JOB_FILES_BUCKET: "job-files",
  StorageNotConfiguredError: class StorageNotConfiguredError extends Error {},
}));

vi.mock("@/lib/db", () => ({ db: {} }));

describe("resolveFileUrlsSafe", () => {
  beforeEach(() => {
    signedJobFileUrls.mockReset();
    signedJobFileUrl.mockReset();
  });

  it("passes http(s) URLs through and batch-signs storage paths once", async () => {
    const { resolveFileUrlsSafe } = await import("./service");
    signedJobFileUrls.mockResolvedValue(
      new Map([
        ["org/job/photo/a.jpg", "https://signed.example/a.jpg"],
        ["org/job/photo/b.jpg", "https://signed.example/b.jpg"],
      ]),
    );

    const urls = await resolveFileUrlsSafe([
      "https://cdn.example/already.jpg",
      "org/job/photo/a.jpg",
      "org/job/photo/b.jpg",
      "http://legacy.example/old.jpg",
    ]);

    expect(signedJobFileUrls).toHaveBeenCalledTimes(1);
    expect(signedJobFileUrls).toHaveBeenCalledWith(["org/job/photo/a.jpg", "org/job/photo/b.jpg"]);
    expect(urls).toEqual([
      "https://cdn.example/already.jpg",
      "https://signed.example/a.jpg",
      "https://signed.example/b.jpg",
      "http://legacy.example/old.jpg",
    ]);
  });

  it("returns nulls for storage paths when the batch sign fails", async () => {
    const { resolveFileUrlsSafe } = await import("./service");
    signedJobFileUrls.mockRejectedValue(new Error("storage down"));

    const urls = await resolveFileUrlsSafe(["org/job/photo/a.jpg", "https://ok.example/x.jpg"]);
    expect(urls).toEqual([null, "https://ok.example/x.jpg"]);
  });
});
