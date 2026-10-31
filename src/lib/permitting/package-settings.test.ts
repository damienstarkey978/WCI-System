import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  contractorLicenseFindMany,
  contractorLicenseCreate,
  contractorLicenseCount,
  nocPresetUpsert,
  cityPortalUpsert,
  cityPortalFindMany,
  encryptPortalPassword,
} = vi.hoisted(() => ({
  contractorLicenseFindMany: vi.fn(),
  contractorLicenseCreate: vi.fn(),
  contractorLicenseCount: vi.fn(),
  nocPresetUpsert: vi.fn(),
  cityPortalUpsert: vi.fn(),
  cityPortalFindMany: vi.fn(),
  encryptPortalPassword: vi.fn((p: string) => `enc.${p}`),
}));

vi.mock("@/lib/db", () => ({
  db: {
    contractorLicense: {
      findMany: contractorLicenseFindMany,
      create: contractorLicenseCreate,
      count: contractorLicenseCount,
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    nocPreset: {
      findMany: vi.fn(),
      upsert: nocPresetUpsert,
    },
    designProfessional: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permitFormSetTemplate: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    paisProductTemplate: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    cityPortalCredential: {
      findMany: cityPortalFindMany,
      upsert: cityPortalUpsert,
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/permitting/portal-crypto", () => ({
  encryptPortalPassword,
  decryptPortalPassword: vi.fn((s: string) => s.replace(/^enc\./, "")),
}));

import { CityPortalKind } from "@/generated/prisma/enums";
import {
  connectCityPortalCredential,
  createContractorLicense,
  ensureDefaultWciContractorLicense,
  listCityPortalCredentials,
  upsertNocPreset,
} from "@/lib/permitting/package-settings";

describe("package-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a contractor license", async () => {
    contractorLicenseCreate.mockResolvedValue({ id: "lic_1", licenseNumber: "CGC1504962" });
    const row = await createContractorLicense("org_1", {
      companyName: "World Construction CO INC",
      qualifierName: "SIMON P P CREWS",
      licenseType: "Certified General Contractor",
      licenseNumber: "CGC1504962",
    });
    expect(row.licenseNumber).toBe("CGC1504962");
    expect(contractorLicenseCreate).toHaveBeenCalled();
  });

  it("seeds the WCI CGC only when the org has none", async () => {
    contractorLicenseCount.mockResolvedValue(1);
    expect(await ensureDefaultWciContractorLicense("org_1")).toBeNull();
    contractorLicenseCount.mockResolvedValue(0);
    contractorLicenseCreate.mockResolvedValue({ id: "lic_new" });
    expect(await ensureDefaultWciContractorLicense("org_1")).toEqual({ id: "lic_new" });
  });

  it("upserts NOC presets with Fee Simple + 1-year defaults", async () => {
    nocPresetUpsert.mockResolvedValue({ id: "noc_1", county: "DUVAL" });
    await upsertNocPreset("org_1", { county: "duval", descriptionOfImprovement: "Siding" });
    expect(nocPresetUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          county: "DUVAL",
          ownersInterest: "Fee Simple",
          expirationRule: "1 year after recording",
        }),
      }),
    );
  });

  it("stores encrypted portal passwords and never returns plaintext", async () => {
    cityPortalUpsert.mockResolvedValue({
      id: "cred_1",
      portal: CityPortalKind.JAX_EPICS,
      username: "wci",
      connectedAt: new Date(),
      disconnectedAt: null,
      lastVerifiedAt: null,
    });
    const view = await connectCityPortalCredential("org_1", {
      portal: CityPortalKind.JAX_EPICS,
      username: "wci",
      password: "sekret",
    });
    expect(encryptPortalPassword).toHaveBeenCalledWith("sekret");
    expect(view).not.toHaveProperty("password");
    expect(view).not.toHaveProperty("encryptedPassword");
    expect(view.hasPassword).toBe(true);
    expect(view.username).toBe("wci");

    cityPortalFindMany.mockResolvedValue([
      {
        id: "cred_1",
        portal: CityPortalKind.JAX_EPICS,
        username: "wci",
        encryptedPassword: "enc.sekret",
        connectedAt: new Date(),
        disconnectedAt: null,
        lastVerifiedAt: null,
      },
    ]);
    const listed = await listCityPortalCredentials("org_1");
    expect(JSON.stringify(listed)).not.toContain("sekret");
    expect(JSON.stringify(listed)).not.toContain("encryptedPassword");
  });
});
