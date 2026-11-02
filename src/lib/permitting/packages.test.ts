import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  jobFindFirst,
  packageCreate,
  packageFindFirst,
  packageUpdate,
  licenseFindFirst,
  permitFindFirst,
} = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  packageCreate: vi.fn(),
  packageFindFirst: vi.fn(),
  packageUpdate: vi.fn(),
  licenseFindFirst: vi.fn(),
  permitFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    job: { findFirst: jobFindFirst },
    permitPackage: {
      create: packageCreate,
      findMany: vi.fn(),
      findFirst: packageFindFirst,
      update: packageUpdate,
    },
    contractorLicense: { findFirst: licenseFindFirst },
    jobPermit: { findFirst: permitFindFirst },
  },
}));

import { PackagePermitType, PermitPackageFormStatus } from "@/generated/prisma/enums";
import {
  PermitPackageError,
  createPermitPackage,
  packageGridFlags,
  updatePermitPackageFields,
} from "@/lib/permitting/packages";

describe("createPermitPackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jobFindFirst.mockResolvedValue({ id: "job_1" });
    packageCreate.mockImplementation(async ({ data }: { data: { name: string; forms: { create: unknown[] } } }) => ({
      id: "pkg_1",
      name: data.name,
      forms: data.forms.create,
    }));
  });

  it("rejects a missing job", async () => {
    jobFindFirst.mockResolvedValue(null);
    await expect(
      createPermitPackage("org_1", "missing", { name: "Test" }),
    ).rejects.toBeInstanceOf(PermitPackageError);
  });

  it("creates a Jacksonville building package with the given form keys", async () => {
    const row = await createPermitPackage("org_1", "job_1", {
      name: "Newcomb Bldg1 test",
      municipality: "JACKSONVILLE",
      permitType: PackagePermitType.BUILDING,
      formKeys: ["noc", "permission_by_owner", "pais"],
    });
    expect(row.name).toBe("Newcomb Bldg1 test");
    expect(packageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          county: "DUVAL",
          municipality: "JACKSONVILLE",
          automateWithCity: false,
          forms: {
            create: expect.arrayContaining([
              expect.objectContaining({ formKey: "noc" }),
              expect.objectContaining({ formKey: "permission_by_owner" }),
              expect.objectContaining({ formKey: "pais" }),
            ]),
          },
        }),
      }),
    );
  });

  it("defaults to preselected NOC when formKeys omitted", async () => {
    await createPermitPackage("org_1", "job_1", {
      name: "Defaults",
      municipality: "DUVAL_UNINCORPORATED",
    });
    const arg = packageCreate.mock.calls[0]?.[0];
    expect(arg.data.forms.create).toEqual([
      expect.objectContaining({ formKey: "noc", sortOrder: 0 }),
    ]);
  });
});

describe("updatePermitPackageFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges into existing fieldValues and normalizes tax folio", async () => {
    packageFindFirst.mockResolvedValue({
      id: "pkg_1",
      organizationId: "org_1",
      fieldValues: { ownerName: "Keep Me", taxFolio: "old" },
      forms: [],
      products: [],
      contractorLicense: null,
      designProfessional: null,
      jobPermit: null,
    });
    packageUpdate.mockImplementation(async ({ data }: { data: { fieldValues: Record<string, string> } }) => ({
      id: "pkg_1",
      fieldValues: data.fieldValues,
      forms: [],
    }));

    const row = await updatePermitPackageFields("org_1", "pkg_1", {
      taxFolio: "100804 0000",
      descriptionOfImprovement: "Addition",
    });

    expect(packageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fieldValues: {
            ownerName: "Keep Me",
            taxFolio: "100804-0000",
            descriptionOfImprovement: "Addition",
          },
        }),
      }),
    );
    expect(row.fieldValues).toEqual(
      expect.objectContaining({ ownerName: "Keep Me", taxFolio: "100804-0000" }),
    );
  });
});

describe("packageGridFlags", () => {
  it("derives NOC / package created from form statuses when timestamps are null", () => {
    const flags = packageGridFlags({
      nocCreatedAt: null,
      packageCreatedAt: null,
      notarizedAt: null,
      recordedAt: null,
      initiatedAt: null,
      createdAt: new Date("2026-10-31T12:00:00Z"),
      forms: [
        { formKey: "noc", status: PermitPackageFormStatus.CREATED },
        { formKey: "pais", status: PermitPackageFormStatus.DRAFT },
      ],
    });
    expect(flags.nocCreated).toBe(true);
    expect(flags.packageCreated).toBe(true);
    expect(flags.notarized).toBe(false);
    expect(flags.recorded).toBe(false);
    expect(flags.initiatedAt.toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });

  it("prefers explicit notarized/recorded timestamps", () => {
    const flags = packageGridFlags({
      nocCreatedAt: new Date("2026-09-01T00:00:00Z"),
      packageCreatedAt: new Date("2026-09-02T00:00:00Z"),
      notarizedAt: new Date("2026-09-03T00:00:00Z"),
      recordedAt: null,
      initiatedAt: new Date("2026-09-10T00:00:00Z"),
      createdAt: new Date("2026-08-01T00:00:00Z"),
      forms: [],
    });
    expect(flags.nocCreated).toBe(true);
    expect(flags.packageCreated).toBe(true);
    expect(flags.notarized).toBe(true);
    expect(flags.recorded).toBe(false);
    expect(flags.initiatedAt.toISOString()).toBe("2026-09-10T00:00:00.000Z");
  });
});
