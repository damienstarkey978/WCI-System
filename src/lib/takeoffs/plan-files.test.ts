import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    takeoff: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    takeoffFile: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    file: { findMany: vi.fn() },
    job: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      takeoffFile: {
        upsert: vi.fn(async (args: { create: { takeoffId: string; fileId: string } }) => ({
          id: `tf_${args.create.fileId}`,
          takeoffId: args.create.takeoffId,
          fileId: args.create.fileId,
          file: { id: args.create.fileId, fileName: "plan.pdf", url: "x", mimeType: "application/pdf", sizeBytes: 1, category: "PLAN", createdAt: new Date(), deletedAt: null },
        })),
      },
    })),
  },
}));

vi.mock("@/lib/files/service", () => ({
  listJobPlanFiles: vi.fn(),
}));

import { db } from "@/lib/db";
import { listJobPlanFiles } from "@/lib/files/service";
import {
  attachPlanFilesToTakeoff,
  listAvailablePlanFilesForTakeoff,
  TakeoffFileNotFoundError,
  TakeoffNotFoundError,
} from "@/lib/takeoffs/service";

describe("takeoff plan files (Plans & Specs source of truth)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists available plans from listJobPlanFiles minus already attached", async () => {
    vi.mocked(db.takeoff.findFirst).mockResolvedValue({ id: "tk_1", jobId: "job_1" } as never);
    vi.mocked(db.takeoffFile.findMany).mockResolvedValue([{ fileId: "f_attached" }] as never);
    vi.mocked(listJobPlanFiles).mockResolvedValue([
      { id: "f_attached", fileName: "old.pdf", url: "a", mimeType: null, sizeBytes: 1, createdAt: new Date() },
      { id: "f_new", fileName: "new.pdf", url: "b", mimeType: null, sizeBytes: 2, createdAt: new Date() },
    ] as never);

    const available = await listAvailablePlanFilesForTakeoff("org_1", "tk_1");

    expect(listJobPlanFiles).toHaveBeenCalledWith("org_1", "job_1");
    expect(available.map((f) => f.id)).toEqual(["f_new"]);
  });

  it("rejects attach when takeoff missing", async () => {
    vi.mocked(db.takeoff.findFirst).mockResolvedValue(null as never);
    await expect(
      attachPlanFilesToTakeoff({ organizationId: "org_1", takeoffId: "missing", fileIds: ["f_1"] }),
    ).rejects.toBeInstanceOf(TakeoffNotFoundError);
  });

  it("rejects attach when file is not a PLAN on the job", async () => {
    vi.mocked(db.takeoff.findFirst).mockResolvedValue({ id: "tk_1", jobId: "job_1" } as never);
    vi.mocked(db.file.findMany).mockResolvedValue([] as never);

    await expect(
      attachPlanFilesToTakeoff({ organizationId: "org_1", takeoffId: "tk_1", fileIds: ["f_other"] }),
    ).rejects.toBeInstanceOf(TakeoffFileNotFoundError);

    expect(vi.mocked(db.file.findMany).mock.calls[0]?.[0]).toMatchObject({
      where: expect.objectContaining({ category: "PLAN", deletedAt: null }),
    });
  });

  it("attaches PLAN files via TakeoffFile link (no second store)", async () => {
    vi.mocked(db.takeoff.findFirst).mockResolvedValue({ id: "tk_1", jobId: "job_1" } as never);
    vi.mocked(db.file.findMany).mockResolvedValue([{ id: "f_1" }] as never);

    const created = await attachPlanFilesToTakeoff({
      organizationId: "org_1",
      takeoffId: "tk_1",
      fileIds: ["f_1"],
    });

    expect(created).toHaveLength(1);
    expect(created[0]?.fileId).toBe("f_1");
  });
});
