import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  packageFindFirst,
  credentialFindMany,
  requestFindFirst,
  requestCreate,
  requestUpdateMany,
  requestFindUniqueOrThrow,
  packageUpdate,
  transaction,
} = vi.hoisted(() => ({
  packageFindFirst: vi.fn(),
  credentialFindMany: vi.fn(),
  requestFindFirst: vi.fn(),
  requestCreate: vi.fn(),
  requestUpdateMany: vi.fn(),
  requestFindUniqueOrThrow: vi.fn(),
  packageUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    permitPackage: { findFirst: packageFindFirst },
    cityPortalCredential: { findMany: credentialFindMany },
    epicsSubmitRequest: {
      findFirst: requestFindFirst,
      create: requestCreate,
      updateMany: requestUpdateMany,
      findUniqueOrThrow: requestFindUniqueOrThrow,
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: transaction,
  },
}));

import { CityPortalKind, EpicsSubmitStatus } from "@/generated/prisma/enums";
import {
  EpicsSeamError,
  claimNextEpicsSubmitRequest,
  requestEpicsCityPermitSubmit,
} from "@/lib/permitting/epics-seam";

describe("requestEpicsCityPermitSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    packageFindFirst.mockResolvedValue({
      id: "pkg_1",
      jobId: "job_1",
      organizationId: "org_1",
      initiatedAt: null,
      forms: [],
      products: [],
      contractorLicense: null,
      designProfessional: null,
      jobPermit: null,
    });
    credentialFindMany.mockResolvedValue([
      {
        id: "cred_1",
        portal: CityPortalKind.JAX_EPICS,
        username: "wci",
        connectedAt: new Date(),
        disconnectedAt: null,
        lastVerifiedAt: null,
      },
    ]);
    requestFindFirst.mockResolvedValue(null);
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        epicsSubmitRequest: {
          create: requestCreate,
        },
        permitPackage: { update: packageUpdate },
      };
      return fn(tx);
    });
    requestCreate.mockResolvedValue({
      id: "req_1",
      packageId: "pkg_1",
      status: EpicsSubmitStatus.QUEUED,
      requestedAt: new Date("2026-10-31T16:00:00Z"),
      claimedAt: null,
      finishedAt: null,
      lastError: null,
      resultPermitNumber: null,
      failureScreenshotUrl: null,
    });
  });

  it("queues an explicit submit and stamps initiatedAt without calling EPICS", async () => {
    const view = await requestEpicsCityPermitSubmit("org_1", "pkg_1", {
      requestedByUserId: "user_1",
    });
    expect(view.status).toBe(EpicsSubmitStatus.QUEUED);
    expect(requestCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EpicsSubmitStatus.QUEUED,
          requestedByUserId: "user_1",
        }),
      }),
    );
    expect(packageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pkg_1" },
        data: expect.objectContaining({ initiatedAt: expect.any(Date) }),
      }),
    );
  });

  it("rejects when JAX EPICS credentials are not connected", async () => {
    credentialFindMany.mockResolvedValue([]);
    await expect(requestEpicsCityPermitSubmit("org_1", "pkg_1")).rejects.toMatchObject({
      code: "credentials_missing",
    } satisfies Partial<EpicsSeamError>);
    expect(requestCreate).not.toHaveBeenCalled();
  });

  it("rejects duplicate QUEUED/RUNNING requests", async () => {
    requestFindFirst.mockResolvedValue({ id: "req_open", status: EpicsSubmitStatus.QUEUED });
    await expect(requestEpicsCityPermitSubmit("org_1", "pkg_1")).rejects.toMatchObject({
      code: "already_queued",
    });
  });
});

describe("claimNextEpicsSubmitRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EPICS_WORKER_ENABLED;
  });

  it("refuses to claim (and thus never drives Playwright) without EPICS_WORKER_ENABLED", async () => {
    await expect(claimNextEpicsSubmitRequest("org_1")).rejects.toMatchObject({
      code: "worker_disabled",
    });
    expect(requestFindFirst).not.toHaveBeenCalled();
  });
});
